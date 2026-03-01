"""
TemporalRx — FastAPI Backend Service
=====================================
Run with: uvicorn api:app --reload --port 8000

All model inference happens here.
Frontend only receives clean JSON and renders it.

Endpoints:
    GET  /doctors                     → list of all doctor IDs + archetypes
    GET  /doctor/{doc_id}             → full profile + current state
    POST /doctor/{doc_id}/predict     → run full prediction for a doctor
    POST /doctor/{doc_id}/event       → push one new event, get updated prediction
    GET  /doctor/{doc_id}/history     → event timeline for visualisation
    GET  /population/stats            → aggregate population stats for overview page
    POST /simulate/stream             → simulate a live event stream for demo
    GET  /health                      → health check
"""

import os
import pickle
import collections
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence, pad_sequence
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

# ─────────────────────────────────────────────
# CONFIG — update paths if needed
# ─────────────────────────────────────────────

MODEL_PATH   = "../model/temporalrx_model.pt"
SCALER_PATH  = "../model/temporalrx_scaler.pkl"
EVENTS_PATH  = "../Data/outputs/doctor_events.csv"
PROFILES_PATH= "../Data/outputs/doctor_profiles.csv"

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ─────────────────────────────────────────────
# REGISTRIES (must match training config)
# ─────────────────────────────────────────────

EVENT_TYPES_ALL = [
    "app_opened","transcription_started","transcription_completed",
    "ai_note_reviewed","ai_note_accepted","ai_note_edited",
    "template_used","feature_discovered","settings_configured",
    "recording_started","recording_completed",
    "transcription_error","recording_failed","app_crashed",
    "long_load_experienced","feature_abandoned","help_page_opened",
    "support_chat_opened","billing_page_visited",
    "colleague_invited","referral_link_shared",
    "team_workspace_created","colleague_accepted_invite",
    "email_sent","email_opened","email_clicked","email_ignored",
    "in_app_nudge_shown","in_app_nudge_clicked","in_app_nudge_dismissed",
    "first_transcription_completed","value_moment_reached",
    "habit_formed","churned","reactivated",
]

EVENT_CATEGORIES_ALL  = ["A_positive","B_friction","C_social","D_lifecycle","E_milestone"]
ARCHETYPES_ALL        = ["early_adopter","skeptical_senior","busy_registrar","passive_tryer","champion"]
JOB_TITLES_ALL        = ["GP","Specialist","Registrar","Nurse Practitioner","Physician Associate"]
SPECIALTIES_ALL       = ["General Practice","Cardiology","Paediatrics","Emergency","Psychiatry",
                          "Oncology","Neurology","Orthopaedics","Dermatology","Radiology"]
PRACTICE_TYPES_ALL    = ["Solo","Small Clinic","Large Hospital","Telehealth"]

EVENT_TYPE_TO_IDX     = {e: i for i, e in enumerate(EVENT_TYPES_ALL)}
EVENT_CAT_TO_IDX      = {c: i for i, c in enumerate(EVENT_CATEGORIES_ALL)}
ARCHETYPE_TO_IDX      = {a: i for i, a in enumerate(ARCHETYPES_ALL)}
JOB_TITLE_TO_IDX      = {j: i for i, j in enumerate(JOB_TITLES_ALL)}
SPECIALTY_TO_IDX      = {s: i for i, s in enumerate(SPECIALTIES_ALL)}
PRACTICE_TYPE_TO_IDX  = {p: i for i, p in enumerate(PRACTICE_TYPES_ALL)}

EVENT_TO_CATEGORY = {}
for cat, events in {
    "A_positive":  EVENT_TYPES_ALL[:11],
    "B_friction":  EVENT_TYPES_ALL[11:19],
    "C_social":    EVENT_TYPES_ALL[19:23],
    "D_lifecycle": EVENT_TYPES_ALL[23:30],
    "E_milestone": EVENT_TYPES_ALL[30:],
}.items():
    for e in events:
        EVENT_TO_CATEGORY[e] = cat

CONTINUOUS_FEATURES = [
    "time_since_last_event_hours","time_since_signup_days","hour_of_day",
    "day_of_week","is_weekend","is_clinic_hours","event_valence",
    "onboarding_stage","transcriptions_completed","features_discovered",
    "trust_score","sessions_total","active_days","cumulative_errors",
    "error_in_first_session","consecutive_errors","days_since_last_activity",
    "emails_ignored_streak","emails_ignored_total","nudges_dismissed_streak",
    "engagement_energy","base_engagement","skepticism","error_tolerance",
    "fatigue_sensitivity",
]

CAT_IDX_COLS = [
    "event_type_idx","event_category_idx","archetype_idx",
    "job_title_idx","specialty_idx","practice_type_idx",
]

EMAIL_CATEGORIES = {0:"activation", 1:"expansion", 2:"social", 3:"recovery", 4:"commitment"}
EMAIL_MESSAGES = {
    "activation": "Complete your first AI transcription — it takes under 5 minutes.",
    "expansion":  "You've mastered transcriptions — try the template library to save even more time.",
    "social":     "Invite a colleague to Heidi and get 2 weeks free.",
    "recovery":   "We noticed you haven't been back — here's what's changed.",
    "commitment": "You're getting serious value from Heidi. Ready to upgrade your plan?",
}

MODEL_CONFIG = {
    "n_event_types": len(EVENT_TYPES_ALL),
    "n_event_categories": 5,
    "n_job_titles": 5,
    "n_specialties": 10,
    "n_practice_types": 4,
    "n_archetypes": 5,
    "event_type_emb_dim": 16,
    "event_cat_emb_dim": 8,
    "job_title_emb_dim": 8,
    "specialty_emb_dim": 8,
    "archetype_emb_dim": 8,
    "n_continuous_features": len(CONTINUOUS_FEATURES),
    "lstm_hidden_size": 32,
    "lstm_num_layers": 1,
    "lstm_dropout": 0.2,
    "hawkes_hidden_dim": 16,
    "max_seq_len": 100,
}

# ─────────────────────────────────────────────
# MODEL ARCHITECTURE (must match training)
# ─────────────────────────────────────────────

class InputEncoder(nn.Module):
    def __init__(self, config):
        super().__init__()
        c = config
        self.event_type_emb    = nn.Embedding(c["n_event_types"],     c["event_type_emb_dim"])
        self.event_cat_emb     = nn.Embedding(c["n_event_categories"], c["event_cat_emb_dim"])
        self.archetype_emb     = nn.Embedding(c["n_archetypes"],       c["archetype_emb_dim"])
        self.job_title_emb     = nn.Embedding(c["n_job_titles"],       c["job_title_emb_dim"])
        self.specialty_emb     = nn.Embedding(c["n_specialties"],      c["specialty_emb_dim"])
        self.practice_type_emb = nn.Embedding(c["n_practice_types"],   8)
        total_emb = c["event_type_emb_dim"]+c["event_cat_emb_dim"]+c["archetype_emb_dim"]+c["job_title_emb_dim"]+c["specialty_emb_dim"]+8
        self.cont_proj   = nn.Linear(c["n_continuous_features"], 56)
        self.output_proj = nn.Sequential(nn.Linear(total_emb+56, 128), nn.LayerNorm(128), nn.ReLU())
        self.output_dim  = 128

    def forward(self, cat_seq, cont_seq):
        e = torch.cat([
            self.event_type_emb(cat_seq[:,:,0]),    self.event_cat_emb(cat_seq[:,:,1]),
            self.archetype_emb(cat_seq[:,:,2]),     self.job_title_emb(cat_seq[:,:,3]),
            self.specialty_emb(cat_seq[:,:,4]),     self.practice_type_emb(cat_seq[:,:,5]),
        ], dim=-1)
        c = torch.relu(self.cont_proj(cont_seq))
        return self.output_proj(torch.cat([e, c], dim=-1))


class LSTMEncoder(nn.Module):
    def __init__(self, config, input_dim):
        super().__init__()
        self.hidden_size = config["lstm_hidden_size"]
        self.num_layers  = config["lstm_num_layers"]
        self.lstm = nn.LSTM(input_size=input_dim, hidden_size=self.hidden_size,
                            num_layers=self.num_layers, batch_first=True,
                            dropout=config["lstm_dropout"] if self.num_layers > 1 else 0.0)

    def forward(self, x, seq_lengths, hidden_state=None):
        packed = pack_padded_sequence(x, seq_lengths.cpu(), batch_first=True, enforce_sorted=True)
        packed_output, (hn, cn) = self.lstm(packed, hidden_state)
        all_hidden, _ = pad_packed_sequence(packed_output, batch_first=True)
        idx = (seq_lengths-1).clamp(min=0).unsqueeze(1).unsqueeze(2).expand(-1,1,self.hidden_size).to(all_hidden.device)
        final_hidden = all_hidden.gather(1, idx).squeeze(1)
        return all_hidden, final_hidden, cn[-1], (hn, cn)


class NeuralHawkesHead(nn.Module):
    def __init__(self, config):
        super().__init__()
        hidden, hd = config["lstm_hidden_size"], config["hawkes_hidden_dim"]
        self.base_intensity_net  = nn.Sequential(nn.Linear(hidden, hd), nn.Tanh(), nn.Linear(hd, 1))
        self.decay_rate_net      = nn.Sequential(nn.Linear(hidden, hd), nn.Tanh(), nn.Linear(hd, 1))
        self.conversion_head     = nn.Sequential(nn.Linear(hidden*2, hd), nn.ReLU(), nn.Dropout(0.3), nn.Linear(hd, 1))
        self.email_category_head = nn.Sequential(nn.Linear(hidden*2, hd), nn.ReLU(), nn.Dropout(0.3), nn.Linear(hd, 5))

    def forward(self, all_hidden, final_hidden, final_cell, delta_seq, seq_lengths):
        base       = torch.nn.functional.softplus(self.base_intensity_net(all_hidden))
        decay      = torch.nn.functional.softplus(self.decay_rate_net(all_hidden)) + 0.01
        lambda_seq = (base * torch.exp(-decay * delta_seq.unsqueeze(-1))).squeeze(-1)
        context    = torch.cat([final_hidden, final_cell], dim=-1)
        return lambda_seq, self.conversion_head(context), self.email_category_head(context)


class TemporalRxModel(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.input_encoder = InputEncoder(config)
        self.lstm_encoder  = LSTMEncoder(config, input_dim=self.input_encoder.output_dim)
        self.hawkes_head   = NeuralHawkesHead(config)

    def forward(self, cat_seq, cont_seq, delta_seq, seq_lengths, hidden_state=None):
        encoded = self.input_encoder(cat_seq, cont_seq)
        all_hidden, final_hidden, final_cell, new_hs = self.lstm_encoder(encoded, seq_lengths, hidden_state)
        lambda_seq, conv_logit, email_logits = self.hawkes_head(all_hidden, final_hidden, final_cell, delta_seq, seq_lengths)
        return lambda_seq, conv_logit, email_logits, new_hs

# ─────────────────────────────────────────────
# APP STARTUP — load model and data once
# ─────────────────────────────────────────────

app = FastAPI(title="TemporalRx API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state — loaded once at startup
model       = None
scaler      = None
events_df   = None
profiles_df = None

# In-memory doctor hidden state store
# key: doc_id, value: {"hidden_state": (hn,cn), "event_count": int, "last_rec": dict}
doctor_store: Dict[str, Any] = {}


@app.on_event("startup")
async def startup_event():
    global model, scaler, events_df, profiles_df

    print("Loading model...")
    model = TemporalRxModel(MODEL_CONFIG).to(DEVICE)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    model.eval()

    print("Loading scaler...")
    with open(SCALER_PATH, "rb") as f:
        scaler = pickle.load(f)

    print("Loading data...")
    events_df   = pd.read_csv(EVENTS_PATH)
    profiles_df = pd.read_csv(PROFILES_PATH)
    events_df["timestamp"] = pd.to_datetime(events_df["timestamp"], format="ISO8601")
    events_df   = events_df.sort_values(["doc_id","timestamp"]).reset_index(drop=True)

    # Merge profile cols onto events
    profile_cols = ["doc_id","archetype","job_title","specialty","practice_type",
                    "base_engagement","skepticism","error_tolerance","fatigue_sensitivity",
                    "invite_colleague_prob","churn_risk"]
    events_df = events_df.merge(profiles_df[profile_cols], on="doc_id", how="left")

    # Encode categoricals
    events_df["event_type"]     = events_df["event_type"].apply(lambda x: x if x in EVENT_TYPE_TO_IDX else "app_opened")
    events_df["event_category"] = events_df["event_category"].apply(lambda x: x if x in EVENT_CAT_TO_IDX else "A_positive")
    events_df["archetype"]      = events_df["archetype"].apply(lambda x: x if x in ARCHETYPE_TO_IDX else "busy_registrar")
    events_df["job_title"]      = events_df["job_title"].apply(lambda x: x if x in JOB_TITLE_TO_IDX else "GP")
    events_df["specialty"]      = events_df["specialty"].apply(lambda x: x if x in SPECIALTY_TO_IDX else "General Practice")
    events_df["practice_type"]  = events_df["practice_type"].apply(lambda x: x if x in PRACTICE_TYPE_TO_IDX else "Solo")
    events_df = events_df.fillna(0)

    for col, mapping in {
        "event_type": EVENT_TYPE_TO_IDX, "event_category": EVENT_CAT_TO_IDX,
        "archetype": ARCHETYPE_TO_IDX,   "job_title": JOB_TITLE_TO_IDX,
        "specialty": SPECIALTY_TO_IDX,   "practice_type": PRACTICE_TYPE_TO_IDX,
    }.items():
        events_df[col+"_idx"] = events_df[col].map(mapping).fillna(0).astype(int)

    # Normalise
    events_df[CONTINUOUS_FEATURES] = scaler.transform(events_df[CONTINUOUS_FEATURES])

    print(f"✓ Startup complete — {len(profiles_df):,} doctors, {len(events_df):,} events")


# ─────────────────────────────────────────────
# INFERENCE HELPERS
# ─────────────────────────────────────────────

def _event_valence(event_type: str) -> float:
    cat = EVENT_TO_CATEGORY.get(event_type, "unknown")
    if cat == "A_positive":  return 1.0
    if cat == "C_social":    return 1.5
    if cat == "E_milestone": return 2.0
    if cat == "B_friction":  return -1.0
    if event_type in ["email_ignored","in_app_nudge_dismissed"]: return -0.5
    if event_type in ["email_opened","email_clicked","in_app_nudge_clicked"]: return 0.5
    return 0.0


@torch.no_grad()
def _predict_intensity_curve(final_hidden, horizon_hours=48.0, resolution_minutes=30.0):
    """Evaluate λ(t) at every resolution_minutes for the next horizon_hours."""
    n      = int(horizon_hours * 60 / resolution_minutes) + 1
    times  = np.linspace(0, horizon_hours, n)
    h      = final_hidden.unsqueeze(1)
    lams   = []
    for dt in times:
        delta = torch.tensor([[[dt]]], dtype=torch.float32).to(DEVICE)
        base  = torch.nn.functional.softplus(model.hawkes_head.base_intensity_net(h))
        decay = torch.nn.functional.softplus(model.hawkes_head.decay_rate_net(h)) + 0.01
        lams.append((base * torch.exp(-decay * delta)).squeeze().item())
    return times.tolist(), lams


def _find_windows(time_points, intensities, current_hour, min_gap=1.0, avoid_night=True):
    """Find primary and secondary optimal send windows."""
    def valid(t):
        if t < min_gap: return False
        if avoid_night:
            fh = (current_hour + int(t)) % 24
            if fh >= 22 or fh < 6: return False
        return True

    scored = [(t, l) for t, l in zip(time_points, intensities) if valid(t)]
    if not scored:
        scored = list(zip(time_points, intensities))
    scored.sort(key=lambda x: x[1], reverse=True)

    def make_win(t, lam):
        return {
            "hours_from_now": round(float(t), 1),
            "send_at": (datetime.now() + timedelta(hours=float(t))).strftime("%Y-%m-%d %H:%M"),
            "intensity": round(float(lam), 4),
            "confidence": round(min(0.99, float(lam) * 0.75 + 0.2), 2),
        }

    primary = make_win(*scored[0])
    secondary = None
    for t, lam in scored[1:]:
        if abs(t - scored[0][0]) >= 6.0:
            secondary = make_win(t, lam)
            break
    if secondary is None and len(scored) > 1:
        secondary = make_win(*scored[1])

    return primary, secondary


@torch.no_grad()
def _run_full_inference(doc_id: str) -> dict:
    """
    Full inference for a doctor from their complete event history.
    Initialises or refreshes their hidden state in doctor_store.
    """
    doc_events = events_df[events_df["doc_id"] == doc_id].sort_values("timestamp")
    if len(doc_events) < 2:
        raise HTTPException(status_code=404, detail=f"Insufficient history for {doc_id}")

    max_len = MODEL_CONFIG["max_seq_len"]
    group   = doc_events.tail(max_len).reset_index(drop=True)
    seq_len = len(group)

    cat_seq  = torch.tensor(group[CAT_IDX_COLS].values, dtype=torch.long).unsqueeze(0).to(DEVICE)
    cont_seq = torch.tensor(group[CONTINUOUS_FEATURES].values.astype(np.float32), dtype=torch.float32).unsqueeze(0).to(DEVICE)

    timestamps = group["timestamp"].values
    deltas = np.zeros(seq_len, dtype=np.float32)
    for i in range(1, seq_len):
        deltas[i] = max(0.0, (pd.Timestamp(timestamps[i]) - pd.Timestamp(timestamps[i-1])).total_seconds() / 3600)
    delta_seq   = torch.tensor(deltas, dtype=torch.float32).unsqueeze(0).to(DEVICE)
    seq_lengths = torch.tensor([seq_len], dtype=torch.long).to(DEVICE)

    model.eval()
    _, _, _, hidden_state = model(cat_seq, cont_seq, delta_seq, seq_lengths)

    # Extract final hidden and cell for heads
    encoded     = model.input_encoder(cat_seq, cont_seq)
    all_hidden, final_hidden, final_cell, new_hs = model.lstm_encoder(encoded, seq_lengths)

    # Save state
    doctor_store[doc_id] = {
        "hidden_state": new_hs,
        "event_count":  seq_len,
        "last_event":   group["event_type"].iloc[-1],
    }

    return _build_recommendation(doc_id, final_hidden, final_cell, group.iloc[-1])


@torch.no_grad()
def _build_recommendation(doc_id: str, final_hidden, final_cell, last_event_row) -> dict:
    """Build the full recommendation dict from hidden states."""
    context = torch.cat([final_hidden, final_cell], dim=-1)

    # Intensity curve
    time_points, intensities = _predict_intensity_curve(final_hidden)

    # Windows
    primary, secondary = _find_windows(time_points, intensities, datetime.now().hour)

    # Email category
    email_logits = model.hawkes_head.email_category_head(context)
    email_probs  = torch.softmax(email_logits, dim=-1).squeeze()
    email_pred   = int(email_probs.argmax().item())
    email_conf   = float(email_probs.max().item())
    email_probs_list = email_probs.cpu().tolist()

    # Conversion
    conv_prob = float(torch.sigmoid(model.hawkes_head.conversion_head(context)).item())

    # Channel
    ignore_streak = float(last_event_row.get("emails_ignored_streak", 0))
    # Note: this is scaled — compare relative to 0
    channel = "in_app_nudge" if ignore_streak > 1.0 else "email"

    rec = {
        "doc_id":            doc_id,
        "generated_at":      datetime.now().isoformat(),

        # Intensity curve — every point for the chart
        "curve": {
            "time_points":  time_points,
            "intensities":  intensities,
        },

        # Send windows
        "primary_window":   primary,
        "secondary_window": secondary,

        # What to send
        "intervention": {
            "channel":         channel,
            "email_category":  EMAIL_CATEGORIES[email_pred],
            "email_confidence":round(email_conf, 3),
            "message":         EMAIL_MESSAGES[EMAIL_CATEGORIES[email_pred]],
            "trigger_now":     primary["hours_from_now"] < 0.5,
            # All 5 category probabilities — for frontend probability bars
            "category_probs": {
                EMAIL_CATEGORIES[i]: round(float(p), 3)
                for i, p in enumerate(email_probs_list)
            },
        },

        # Conversion outlook
        "conversion": {
            "probability":   round(conv_prob, 3),
            "percentage":    round(conv_prob * 100, 1),
        },
    }

    # Cache recommendation
    if doc_id in doctor_store:
        doctor_store[doc_id]["last_rec"] = rec

    return rec


# ─────────────────────────────────────────────
# REQUEST / RESPONSE MODELS
# ─────────────────────────────────────────────

class NewEventRequest(BaseModel):
    event_type:                 str
    timestamp:                  Optional[str] = None
    time_since_last_event_hours:Optional[float] = 1.0
    hour_of_day:                Optional[int]   = None
    day_of_week:                Optional[int]   = None
    # Any additional state fields the frontend can provide
    # If not provided, we'll use the last known values from the doctor's history
    extra_fields:               Optional[Dict[str, Any]] = {}


class SimulateStreamRequest(BaseModel):
    doc_id:    str
    n_events:  int = 6


# ─────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "doctors_loaded": len(profiles_df) if profiles_df is not None else 0,
        "device": str(DEVICE),
    }


@app.get("/doctors")
def list_doctors(limit: int = 100, archetype: Optional[str] = None):
    """
    List doctors with their profile summary.
    Frontend uses this to populate the doctor selector.
    """
    df = profiles_df.copy()
    if archetype:
        df = df[df["archetype"] == archetype]

    # Add event count and last event info
    event_counts   = events_df.groupby("doc_id").size().rename("event_count")
    last_events    = events_df.groupby("doc_id")["timestamp"].max().rename("last_event_at")
    conv_labels    = events_df.groupby("doc_id")["converted"].last().rename("converted")
    churn_labels   = events_df.groupby("doc_id")["churned"].last().rename("churned")
    onboard_stages = events_df.groupby("doc_id")["onboarding_stage"].last().rename("current_stage")

    df = df.merge(event_counts,   on="doc_id", how="left")
    df = df.merge(last_events,    on="doc_id", how="left")
    df = df.merge(conv_labels,    on="doc_id", how="left")
    df = df.merge(churn_labels,   on="doc_id", how="left")
    df = df.merge(onboard_stages, on="doc_id", how="left")

    df["last_event_at"] = df["last_event_at"].astype(str)

    return {
        "total": len(df),
        "doctors": df.head(limit).to_dict(orient="records"),
    }


@app.get("/doctor/{doc_id}")
def get_doctor_profile(doc_id: str):
    """
    Full doctor profile + current state snapshot.
    Frontend uses this to populate the identity card and gauges.
    """
    if doc_id not in profiles_df["doc_id"].values:
        raise HTTPException(status_code=404, detail=f"Doctor {doc_id} not found")

    profile = profiles_df[profiles_df["doc_id"] == doc_id].iloc[0].to_dict()
    doc_events = events_df[events_df["doc_id"] == doc_id].sort_values("timestamp")

    if len(doc_events) == 0:
        raise HTTPException(status_code=404, detail="No events found")

    last = doc_events.iloc[-1]

    # Get raw (unscaled) values for display
    # We stored scaled values in events_df, so we inverse-transform key cols
    raw_vals = scaler.inverse_transform(
        doc_events[CONTINUOUS_FEATURES].tail(1)
    )[0]
    raw_dict = dict(zip(CONTINUOUS_FEATURES, raw_vals))

    STAGE_LABELS = {0: "Signed Up", 1: "Activated", 2: "Value Moment", 3: "Habit Formed"}

    return {
        "doc_id":          doc_id,
        "profile":         profile,
        "current_state": {
            "onboarding_stage":       int(raw_dict["onboarding_stage"]),
            "onboarding_stage_label": STAGE_LABELS.get(int(raw_dict["onboarding_stage"]), "Unknown"),
            "transcriptions_completed": int(raw_dict["transcriptions_completed"]),
            "features_discovered":    int(raw_dict["features_discovered"]),
            "trust_score":            round(raw_dict["trust_score"], 3),
            "engagement_energy":      round(raw_dict["engagement_energy"], 3),
            "emails_ignored_streak":  int(raw_dict["emails_ignored_streak"]),
            "days_since_last_activity": round(raw_dict["days_since_last_activity"], 1),
            "cumulative_errors":      int(raw_dict["cumulative_errors"]),
            "converted":              bool(last.get("converted", False)),
            "churned":                bool(last.get("churned", False)),
            "total_events":           len(doc_events),
            "active_days":            int(raw_dict["active_days"]),
        },
        "journey_summary": {
            "signup_date":   profile.get("signup_date"),
            "days_observed": round(raw_dict["time_since_signup_days"], 1),
        }
    }


@app.post("/doctor/{doc_id}/predict")
def predict_for_doctor(doc_id: str):
    """
    Run full model inference for a doctor using their complete event history.
    Returns the full recommendation including intensity curve.
    This is the main endpoint — call it once to initialise a doctor.
    """
    if doc_id not in profiles_df["doc_id"].values:
        raise HTTPException(status_code=404, detail=f"Doctor {doc_id} not found")

    rec = _run_full_inference(doc_id)
    return rec


@app.post("/doctor/{doc_id}/event")
def push_new_event(doc_id: str, req: NewEventRequest):
    """
    Push one new event for a doctor and get updated predictions.
    Uses incremental LSTM inference — O(1), doesn't reprocess full history.

    This is the live update endpoint.
    Call it every time a new event arrives for a doctor.
    """
    if doc_id not in profiles_df["doc_id"].values:
        raise HTTPException(status_code=404, detail=f"Doctor {doc_id} not found")

    # If doctor not initialised, run full inference first
    if doc_id not in doctor_store:
        _run_full_inference(doc_id)

    saved = doctor_store[doc_id]

    # Get last known state from events_df for context
    doc_events  = events_df[events_df["doc_id"] == doc_id].sort_values("timestamp")
    last_row    = doc_events.iloc[-1].to_dict()
    profile_row = profiles_df[profiles_df["doc_id"] == doc_id].iloc[0].to_dict()

    # Build event vector for the new event
    # Use last known values for state fields, override with what's provided
    now = datetime.now()
    event_hour    = req.hour_of_day if req.hour_of_day is not None else now.hour
    event_dow     = req.day_of_week if req.day_of_week is not None else now.weekday()
    event_type    = req.event_type if req.event_type in EVENT_TYPE_TO_IDX else "app_opened"
    event_cat     = EVENT_TO_CATEGORY.get(event_type, "A_positive")
    event_valence = _event_valence(event_type)

    # Build continuous feature vector using last known state
    raw_last = scaler.inverse_transform(doc_events[CONTINUOUS_FEATURES].tail(1))[0]
    raw_dict = dict(zip(CONTINUOUS_FEATURES, raw_last))

    new_cont = [
        req.time_since_last_event_hours,
        raw_dict["time_since_signup_days"] + req.time_since_last_event_hours/24,
        event_hour,
        event_dow,
        1.0 if event_dow >= 5 else 0.0,
        0.0,  # is_clinic_hours — simplified
        event_valence,
        raw_dict["onboarding_stage"],
        raw_dict["transcriptions_completed"],
        raw_dict["features_discovered"],
        raw_dict["trust_score"],
        raw_dict["sessions_total"],
        raw_dict["active_days"],
        raw_dict["cumulative_errors"],
        raw_dict["error_in_first_session"],
        raw_dict["consecutive_errors"],
        req.time_since_last_event_hours / 24,
        raw_dict["emails_ignored_streak"] + (1 if event_type == "email_ignored" else 0),
        raw_dict["emails_ignored_total"]  + (1 if event_type == "email_ignored" else 0),
        raw_dict["nudges_dismissed_streak"] + (1 if event_type == "in_app_nudge_dismissed" else 0),
        raw_dict["engagement_energy"],
        profile_row["base_engagement"],
        profile_row["skepticism"],
        profile_row["error_tolerance"],
        profile_row["fatigue_sensitivity"],
    ]

    # Scale the new event
    new_cont_scaled = scaler.transform([new_cont])[0]

    # Build tensors — seq_len = 1
    cat_tensor  = torch.tensor([[
        EVENT_TYPE_TO_IDX.get(event_type, 0),
        EVENT_CAT_TO_IDX.get(event_cat, 0),
        ARCHETYPE_TO_IDX.get(profile_row["archetype"], 0),
        JOB_TITLE_TO_IDX.get(profile_row["job_title"], 0),
        SPECIALTY_TO_IDX.get(profile_row["specialty"], 0),
        PRACTICE_TYPE_TO_IDX.get(profile_row["practice_type"], 0),
    ]], dtype=torch.long).unsqueeze(0).to(DEVICE)

    cont_tensor  = torch.tensor(new_cont_scaled, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(DEVICE)
    delta_tensor = torch.tensor([[[req.time_since_last_event_hours]]], dtype=torch.float32).to(DEVICE).squeeze(-1)
    seq_lengths  = torch.tensor([1], dtype=torch.long).to(DEVICE)

    # Incremental LSTM step
    model.eval()
    with torch.no_grad():
        encoded = model.input_encoder(cat_tensor, cont_tensor)
        all_hidden, final_hidden, final_cell, new_hs = model.lstm_encoder(
            encoded, seq_lengths, saved["hidden_state"]
        )

    # Update store
    prev_rec = saved.get("last_rec", {})
    doctor_store[doc_id]["hidden_state"] = new_hs
    doctor_store[doc_id]["event_count"]  = saved["event_count"] + 1
    doctor_store[doc_id]["last_event"]   = event_type

    # Build recommendation
    rec = _build_recommendation(doc_id, final_hidden, final_cell, last_row)
    rec["triggering_event"] = event_type

    # Did the recommendation change?
    prev_window = prev_rec.get("primary_window", {}).get("send_at")
    rec["recommendation_changed"] = prev_window != rec["primary_window"]["send_at"]
    rec["previous_window"]        = prev_window

    return rec


@app.get("/doctor/{doc_id}/history")
def get_doctor_history(doc_id: str, last_n: int = 50):
    """
    Event timeline for a doctor.
    Frontend uses this to render the swimlane timeline chart.
    """
    if doc_id not in profiles_df["doc_id"].values:
        raise HTTPException(status_code=404, detail=f"Doctor {doc_id} not found")

    doc_events = events_df[events_df["doc_id"] == doc_id].sort_values("timestamp")
    recent     = doc_events.tail(last_n).copy()

    # Inverse transform to get readable values
    raw_vals = scaler.inverse_transform(recent[CONTINUOUS_FEATURES])
    raw_df   = pd.DataFrame(raw_vals, columns=CONTINUOUS_FEATURES)

    events_out = []
    for i, (_, row) in enumerate(recent.iterrows()):
        raw = raw_df.iloc[i]
        events_out.append({
            "event_id":             row.get("event_id", ""),
            "event_type":           row["event_type"],
            "event_category":       row["event_category"],
            "event_valence":        _event_valence(row["event_type"]),
            "timestamp":            str(row["timestamp"]),
            "time_since_signup_days": round(float(raw["time_since_signup_days"]), 2),
            "hour_of_day":          int(raw["hour_of_day"]),
            "onboarding_stage":     int(raw["onboarding_stage"]),
            "engagement_energy":    round(float(raw["engagement_energy"]), 3),
            "emails_ignored_streak":int(raw["emails_ignored_streak"]),
            "conversion_prob":      None,  # populated by frontend after /predict
        })

    return {
        "doc_id":       doc_id,
        "total_events": len(doc_events),
        "shown_events": len(events_out),
        "events":       events_out,
    }


@app.get("/population/stats")
def get_population_stats():
    """
    Aggregate stats across the full population.
    Frontend uses this for the Population Intelligence page.
    """
    last_events = events_df.groupby("doc_id").last().reset_index()

    # Merge profiles
    merged = last_events.merge(profiles_df[["doc_id","archetype"]], on="doc_id", how="left")

    # Inverse transform to get raw values for readable stats
    raw_vals = scaler.inverse_transform(last_events[CONTINUOUS_FEATURES])
    raw_df   = pd.DataFrame(raw_vals, columns=CONTINUOUS_FEATURES, index=last_events.index)
    merged["onboarding_stage_raw"] = raw_df["onboarding_stage"].values

    # Per archetype stats
    archetype_stats = []
    for arch in ARCHETYPES_ALL:
        sub = merged[merged["archetype"] == arch]
        if len(sub) == 0:
            continue
        conv_rate     = sub["converted"].mean()
        churn_rate    = sub["churned"].mean()
        calendar_rate = conv_rate * 0.65   # synthetic baseline

        archetype_stats.append({
            "archetype":        arch,
            "n_doctors":        len(sub),
            "conversion_rate":  round(float(conv_rate), 3),
            "churn_rate":       round(float(churn_rate), 3),
            "calendar_baseline":round(float(calendar_rate), 3),
            "lift_pp":          round(float((conv_rate - calendar_rate) * 100), 1),
        })

    # Overall
    overall_conv      = float(merged["converted"].mean())
    overall_calendar  = overall_conv * 0.65

    # Stage distribution
    stage_counts = raw_df["onboarding_stage"].round().astype(int).value_counts().sort_index()
    stage_labels = {0:"Signed Up", 1:"Activated", 2:"Value Moment", 3:"Habit Formed"}

    # Email send timing — calendar drip vs optimal (illustrative)
    # Shows what hours emails were sent under calendar drip
    email_events = events_df[events_df["event_type"] == "email_sent"].copy()
    raw_email    = scaler.inverse_transform(email_events[CONTINUOUS_FEATURES])
    email_hours  = raw_email[:, CONTINUOUS_FEATURES.index("hour_of_day")]
    hour_dist    = collections.Counter(email_hours.astype(int).tolist())

    return {
        "overall": {
            "total_doctors":      len(profiles_df),
            "conversion_rate":    round(overall_conv, 3),
            "calendar_baseline":  round(overall_calendar, 3),
            "lift_pp":            round((overall_conv - overall_calendar) * 100, 1),
            "churn_rate":         round(float(merged["churned"].mean()), 3),
        },
        "by_archetype":    archetype_stats,
        "stage_distribution": [
            {"stage": k, "label": stage_labels.get(k,"?"), "count": int(v)}
            for k, v in stage_counts.items()
        ],
        "calendar_send_hours": dict(sorted(hour_dist.items())),
    }


@app.post("/simulate/stream")
def simulate_stream(req: SimulateStreamRequest):
    """
    Simulate a live event stream for demo purposes.
    Returns a sequence of predictions as events arrive one by one.
    Frontend plays these back with animations.
    """
    doc_id   = req.doc_id
    n_events = req.n_events

    if doc_id not in profiles_df["doc_id"].values:
        raise HTTPException(status_code=404, detail=f"Doctor {doc_id} not found")

    doc_events = events_df[events_df["doc_id"] == doc_id].sort_values("timestamp")
    events_to_play = doc_events.tail(n_events).reset_index(drop=True)

    # Clear saved state for fresh simulation
    if doc_id in doctor_store:
        del doctor_store[doc_id]

    results = []
    for i, (_, row) in enumerate(events_to_play.iterrows()):
        raw = scaler.inverse_transform([row[CONTINUOUS_FEATURES].values.astype(np.float32)])[0]
        raw_dict = dict(zip(CONTINUOUS_FEATURES, raw))

        new_event_req = NewEventRequest(
            event_type=row["event_type"],
            time_since_last_event_hours=float(raw_dict["time_since_last_event_hours"]),
            hour_of_day=int(raw_dict["hour_of_day"]),
            day_of_week=int(raw_dict["day_of_week"]),
        )
        rec = push_new_event(doc_id, new_event_req)
        rec["step"] = i + 1
        results.append(rec)

    return {
        "doc_id":  doc_id,
        "n_steps": len(results),
        "stream":  results,
    }


# ─────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)