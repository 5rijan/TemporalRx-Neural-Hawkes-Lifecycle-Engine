"""
TemporalRx — Synthetic Data Generator
Generates realistic doctor onboarding event sequences for Heidi AI scribe.
All doctors are identified by doc_id only. All behaviour is parameterised.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timedelta
import random
import uuid
import json
import os

# ─────────────────────────────────────────────
# CONFIGURATION — tweak these to change the world
# ─────────────────────────────────────────────

CONFIG = {
    "n_doctors": 10000,
    "simulation_days": 56,          # 8 weeks
    "random_seed": 42,

    # Archetype distribution (must sum to 1.0)
    "archetype_distribution": {
        "early_adopter":    0.15,
        "skeptical_senior": 0.25,
        "busy_registrar":   0.30,
        "passive_tryer":    0.20,
        "champion":         0.10,
    },

    # Global error rates
    "base_error_rate":       0.12,   # 12% chance of error per transcription attempt
    "base_crash_rate":       0.03,   # 3% chance of app crash per session

    # Intervention schedule (calendar-based drip — the "before" baseline)
    "calendar_drip_days":    [1, 3, 7, 14, 21, 35],

    # Value moment definition
    "value_moment_threshold": 3,     # transcriptions completed to reach value moment

    # Churn definition
    "churn_gap_days":        14,     # 14 days no activity = churned

    # Output
    "output_dir":            "./outputs",
}

# ─────────────────────────────────────────────
# EVENT TYPE REGISTRY
# ─────────────────────────────────────────────

EVENT_CATEGORIES = {
    "A_positive":   ["app_opened", "transcription_started", "transcription_completed",
                     "ai_note_reviewed", "ai_note_accepted", "ai_note_edited",
                     "template_used", "feature_discovered", "settings_configured",
                     "recording_started", "recording_completed"],

    "B_friction":   ["transcription_error", "recording_failed", "app_crashed",
                     "long_load_experienced", "feature_abandoned", "help_page_opened",
                     "support_chat_opened", "billing_page_visited"],

    "C_social":     ["colleague_invited", "referral_link_shared",
                     "team_workspace_created", "colleague_accepted_invite"],

    "D_lifecycle":  ["email_sent", "email_opened", "email_clicked", "email_ignored",
                     "in_app_nudge_shown", "in_app_nudge_clicked", "in_app_nudge_dismissed"],

    "E_milestone":  ["first_transcription_completed", "value_moment_reached",
                     "habit_formed", "churned", "reactivated"],
}

# Flatten for lookup
EVENT_TO_CATEGORY = {}
for cat, events in EVENT_CATEGORIES.items():
    for e in events:
        EVENT_TO_CATEGORY[e] = cat

# Decay profiles — used later by Hawkes layer
# shape: exponential | power_law | inhibitory_fast | inhibitory_slow | cumulative_inhibitory
DECAY_PROFILES = {
    "app_opened":                   ("exponential",          0.8,   2.0),   # (shape, magnitude, half_life_hours)
    "transcription_started":        ("exponential",          1.0,   3.0),
    "transcription_completed":      ("exponential",          1.4,   6.0),
    "ai_note_accepted":             ("power_law",            1.6,   12.0),
    "feature_discovered":           ("power_law",            1.2,   10.0),
    "colleague_invited":            ("power_law",            2.0,   48.0),
    "value_moment_reached":         ("power_law",            2.5,   72.0),
    "transcription_error":          ("inhibitory_fast",     -1.2,   4.0),
    "app_crashed":                  ("inhibitory_slow",     -1.8,   24.0),
    "help_page_opened":             ("inhibitory_fast",     -0.6,   2.0),
    "email_ignored":                ("cumulative_inhibitory",-0.4,  12.0),  # gets worse each time
    "in_app_nudge_dismissed":       ("inhibitory_fast",     -0.5,   3.0),
}

# Email content categories
EMAIL_CATEGORIES = {
    0: "activation",    # stage 0-1: first transcription guidance
    1: "expansion",     # stage 2: try next feature
    2: "social",        # stage 2-3: invite colleague
    3: "recovery",      # re-engagement after silence
    4: "commitment",    # conversion push
}

# ─────────────────────────────────────────────
# ARCHETYPE DEFINITIONS
# ─────────────────────────────────────────────

ARCHETYPES = {
    "early_adopter": {
        "description": "Enthusiastic, adopts quickly, low friction tolerance needed",
        # Temporal behaviour
        "clinic_hours":             [(8, 10), (13, 15)],     # active windows (hour ranges)
        "weekend_activity_prob":    0.15,
        "sessions_per_active_day":  (1.5, 0.5),              # (mean, std)
        "events_per_session":       (6, 2),

        # Engagement personality
        "base_engagement":          0.75,
        "time_to_first_action":     (0.5, 0.3),              # days after signup
        "skepticism":               0.1,                      # 0=trusts immediately, 1=never trusts
        "error_tolerance":          0.7,                      # prob of returning after error
        "fatigue_sensitivity":      0.2,                      # how quickly email fatigue builds

        # Conversion
        "base_conversion_prob":     0.72,
        "invite_colleague_prob":    0.45,
        "churn_risk":               0.15,
    },

    "skeptical_senior": {
        "description": "Experienced GP, slow to trust AI, high impact if converted",
        "clinic_hours":             [(8, 9), (14, 16)],
        "weekend_activity_prob":    0.05,
        "sessions_per_active_day":  (1.0, 0.3),
        "events_per_session":       (4, 1.5),

        "base_engagement":          0.35,
        "time_to_first_action":     (2.0, 1.0),
        "skepticism":               0.75,
        "error_tolerance":          0.2,                      # one error = gone for 48h
        "fatigue_sensitivity":      0.85,                     # very sensitive to over-messaging

        "base_conversion_prob":     0.31,
        "invite_colleague_prob":    0.55,                     # if they convert, they advocate strongly
        "churn_risk":               0.55,
    },

    "busy_registrar": {
        "description": "Junior doctor, erratic schedule, burst usage patterns",
        "clinic_hours":             [(7, 9), (12, 13), (17, 19)],
        "weekend_activity_prob":    0.25,
        "sessions_per_active_day":  (2.0, 1.0),
        "events_per_session":       (3, 2),                   # short sessions

        "base_engagement":          0.50,
        "time_to_first_action":     (1.0, 0.8),
        "skepticism":               0.30,
        "error_tolerance":          0.55,
        "fatigue_sensitivity":      0.50,

        "base_conversion_prob":     0.48,
        "invite_colleague_prob":    0.25,
        "churn_risk":               0.38,
    },

    "passive_tryer": {
        "description": "Signed up but uncommitted, high churn risk, needs early win",
        "clinic_hours":             [(9, 11)],
        "weekend_activity_prob":    0.05,
        "sessions_per_active_day":  (0.7, 0.4),
        "events_per_session":       (2, 1),

        "base_engagement":          0.20,
        "time_to_first_action":     (3.0, 2.0),
        "skepticism":               0.60,
        "error_tolerance":          0.15,
        "fatigue_sensitivity":      0.90,

        "base_conversion_prob":     0.18,
        "invite_colleague_prob":    0.10,
        "churn_risk":               0.72,
    },

    "champion": {
        "description": "Power user, explores everything, becomes internal advocate",
        "clinic_hours":             [(7, 10), (12, 14), (16, 18)],
        "weekend_activity_prob":    0.30,
        "sessions_per_active_day":  (2.5, 0.7),
        "events_per_session":       (8, 3),

        "base_engagement":          0.90,
        "time_to_first_action":     (0.2, 0.1),
        "skepticism":               0.05,
        "error_tolerance":          0.85,
        "fatigue_sensitivity":      0.10,

        "base_conversion_prob":     0.88,
        "invite_colleague_prob":    0.70,
        "churn_risk":               0.05,
    },
}

# ─────────────────────────────────────────────
# DOCTOR PROFILE GENERATOR
# ─────────────────────────────────────────────

JOB_TITLES      = ["GP", "Specialist", "Registrar", "Nurse Practitioner", "Physician Associate"]
SPECIALTIES     = ["General Practice", "Cardiology", "Paediatrics", "Emergency", "Psychiatry",
                   "Oncology", "Neurology", "Orthopaedics", "Dermatology", "Radiology"]
PRACTICE_TYPES  = ["Solo", "Small Clinic", "Large Hospital", "Telehealth"]
PRACTICE_SIZES  = ["1", "2-5", "6-20", "20+"]
SIGNUP_SOURCES  = ["organic", "referral", "paid_ad", "colleague_invite", "conference"]
GOALS           = ["save_time", "better_notes", "compliance", "colleague_recommended", "curiosity"]
PLAN_TYPES      = ["trial", "starter", "pro"]

def generate_doctor_profile(doc_id: str, archetype: str, signup_date: datetime) -> Dict:
    arch = ARCHETYPES[archetype]

    # Job title biased by archetype
    if archetype == "skeptical_senior":
        job_title = np.random.choice(["GP", "Specialist"], p=[0.6, 0.4])
    elif archetype == "busy_registrar":
        job_title = "Registrar"
    elif archetype == "champion":
        job_title = np.random.choice(["GP", "Specialist", "Nurse Practitioner"], p=[0.5, 0.3, 0.2])
    else:
        job_title = np.random.choice(JOB_TITLES)

    return {
        "doc_id":               doc_id,
        "archetype":            archetype,
        "signup_date":          signup_date.isoformat(),
        "job_title":            job_title,
        "specialty":            np.random.choice(SPECIALTIES),
        "practice_type":        np.random.choice(PRACTICE_TYPES),
        "practice_size":        np.random.choice(PRACTICE_SIZES),
        "signup_source":        np.random.choice(SIGNUP_SOURCES),
        "self_reported_goal":   np.random.choice(GOALS),
        "plan_type":            np.random.choice(PLAN_TYPES, p=[0.5, 0.35, 0.15]),

        # Sampled personality parameters (slight noise around archetype defaults)
        "base_engagement":      float(np.clip(np.random.normal(arch["base_engagement"], 0.08), 0.05, 0.99)),
        "skepticism":           float(np.clip(np.random.normal(arch["skepticism"], 0.08), 0.0, 1.0)),
        "error_tolerance":      float(np.clip(np.random.normal(arch["error_tolerance"], 0.08), 0.0, 1.0)),
        "fatigue_sensitivity":  float(np.clip(np.random.normal(arch["fatigue_sensitivity"], 0.08), 0.0, 1.0)),
        "invite_colleague_prob":float(np.clip(np.random.normal(arch["invite_colleague_prob"], 0.05), 0.0, 1.0)),
        "churn_risk":           float(np.clip(np.random.normal(arch["churn_risk"], 0.05), 0.0, 1.0)),
    }

# ─────────────────────────────────────────────
# DOCTOR STATE — tracks evolving state during simulation
# ─────────────────────────────────────────────

@dataclass
class DoctorState:
    doc_id: str
    profile: Dict
    archetype_params: Dict
    signup_dt: datetime

    # Onboarding progress
    onboarding_stage: int = 0           # 0=signed_up 1=activated 2=value_moment 3=habit
    transcriptions_completed: int = 0
    features_discovered: int = 0
    sessions_total: int = 0
    active_days: int = 0

    # Trust and engagement
    trust_score: float = 0.0            # ai_notes_accepted / transcriptions_completed
    ai_notes_accepted: int = 0
    current_engagement_energy: float = 0.5

    # Friction tracking
    cumulative_errors: int = 0
    error_in_first_session: bool = False
    consecutive_errors: int = 0
    suppression_until: Optional[datetime] = None   # suppressed after crash/error

    # Fatigue tracking
    emails_sent_total: int = 0
    emails_ignored_streak: int = 0
    emails_ignored_total: int = 0
    last_email_dt: Optional[datetime] = None
    nudges_dismissed_streak: int = 0

    # Temporal tracking
    last_activity_dt: Optional[datetime] = None
    days_since_last_activity: float = 0.0
    consecutive_days_active: int = 0
    last_session_dt: Optional[datetime] = None

    # Social
    colleagues_invited: int = 0
    has_invited: bool = False

    # Outcome
    converted: bool = False
    churned: bool = False
    churn_dt: Optional[datetime] = None
    reactivated: bool = False

    # Calendar drip tracking
    drip_days_sent: List[int] = field(default_factory=list)

    # Events log for this doctor
    events: List[Dict] = field(default_factory=list)

    def days_since_signup(self, current_dt: datetime) -> float:
        return (current_dt - self.signup_dt).total_seconds() / 86400

    def is_suppressed(self, current_dt: datetime) -> bool:
        if self.suppression_until is None:
            return False
        return current_dt < self.suppression_until

    def effective_engagement(self) -> float:
        """Compute engagement energy modulated by fatigue and trust"""
        fatigue_penalty = self.emails_ignored_streak * 0.08 * self.profile["fatigue_sensitivity"]
        trust_boost = self.trust_score * 0.2
        return float(np.clip(self.current_engagement_energy - fatigue_penalty + trust_boost, 0.0, 1.0))

# ─────────────────────────────────────────────
# EVENT LOGGER
# ─────────────────────────────────────────────

def log_event(state: DoctorState, dt: datetime, event_type: str,
              session_id: str, extra: Dict = None) -> Dict:
    """Create one event row with all derived fields computed at time of logging."""

    time_since_last = 0.0
    if state.last_activity_dt is not None:
        time_since_last = (dt - state.last_activity_dt).total_seconds() / 3600  # hours

    event = {
        # Identity
        "event_id":                     str(uuid.uuid4())[:8],
        "doc_id":                       state.doc_id,
        "session_id":                   session_id,
        "timestamp":                    dt.isoformat(),

        # Temporal features
        "time_since_last_event_hours":  round(time_since_last, 3),
        "time_since_signup_days":       round(state.days_since_signup(dt), 3),
        "hour_of_day":                  dt.hour,
        "day_of_week":                  dt.weekday(),   # 0=Monday
        "is_weekend":                   int(dt.weekday() >= 5),
        "is_clinic_hours":              int(_is_clinic_hours(dt, state.archetype_params)),

        # Event identity
        "event_type":                   event_type,
        "event_category":               EVENT_TO_CATEGORY.get(event_type, "unknown"),
        "event_valence":                _event_valence(event_type),

        # Onboarding state AT TIME OF EVENT
        "onboarding_stage":             state.onboarding_stage,
        "transcriptions_completed":     state.transcriptions_completed,
        "features_discovered":          state.features_discovered,
        "trust_score":                  round(state.trust_score, 3),
        "sessions_total":               state.sessions_total,
        "active_days":                  state.active_days,

        # Friction memory (LSTM-critical — requires history)
        "cumulative_errors":            state.cumulative_errors,
        "error_in_first_session":       int(state.error_in_first_session),
        "consecutive_errors":           state.consecutive_errors,
        "days_since_last_activity":     round(state.days_since_last_activity, 3),
        "consecutive_days_active":      state.consecutive_days_active,

        # Fatigue memory (LSTM-critical — requires history)
        "emails_sent_total":            state.emails_sent_total,
        "emails_ignored_streak":        state.emails_ignored_streak,
        "emails_ignored_total":         state.emails_ignored_total,
        "nudges_dismissed_streak":      state.nudges_dismissed_streak,

        # Current engagement
        "engagement_energy":            round(state.effective_engagement(), 3),

        # Outcome labels (used for training)
        "converted":                    int(state.converted),
        "churned":                      int(state.churned),
    }

    if extra:
        event.update(extra)

    state.events.append(event)
    state.last_activity_dt = dt
    return event

def _event_valence(event_type: str) -> float:
    cat = EVENT_TO_CATEGORY.get(event_type, "unknown")
    if cat == "A_positive":   return 1.0
    if cat == "C_social":     return 1.5
    if cat == "E_milestone":  return 2.0
    if cat == "B_friction":   return -1.0
    if event_type in ["email_ignored", "in_app_nudge_dismissed"]: return -0.5
    if event_type in ["email_opened", "email_clicked", "in_app_nudge_clicked"]: return 0.5
    return 0.0

def _is_clinic_hours(dt: datetime, arch_params: Dict) -> bool:
    for (start, end) in arch_params["clinic_hours"]:
        if start <= dt.hour < end:
            return True
    return False

# ─────────────────────────────────────────────
# INTERVENTION ENGINE (the "before" calendar drip)
# ─────────────────────────────────────────────

def determine_email_category(state: DoctorState) -> int:
    """Rule-based email category selection based on onboarding stage."""
    if state.days_since_last_activity > 7:
        return 3  # recovery
    if state.onboarding_stage == 0:
        return 0  # activation
    if state.onboarding_stage == 1:
        return 0  # activation
    if state.onboarding_stage == 2 and not state.has_invited:
        return random.choice([1, 2])  # expansion or social
    if state.onboarding_stage == 3:
        return 4  # commitment
    return 1  # default expansion

def should_open_email(state: DoctorState) -> bool:
    """Simulate doctor's response to receiving an email."""
    base_open_rate = 0.35

    # Fatigue penalty — non-linear, this is the key non-standard dynamic
    # email_ignored_streak of 3+ causes strong suppression — standard Hawkes can't model this
    fatigue_mult = max(0.05, 1.0 - (state.emails_ignored_streak ** 1.5) * state.profile["fatigue_sensitivity"] * 0.15)

    # Engagement boost
    engagement_mult = 0.5 + state.effective_engagement()

    # Suppression if recently had negative event
    suppression_mult = 0.3 if state.consecutive_errors > 0 else 1.0

    prob = base_open_rate * fatigue_mult * engagement_mult * suppression_mult
    return random.random() < np.clip(prob, 0.02, 0.85)

# ─────────────────────────────────────────────
# SESSION SIMULATOR
# ─────────────────────────────────────────────

def simulate_session(state: DoctorState, session_start: datetime) -> List[Dict]:
    """Simulate one clinical session — a burst of events."""
    arch = state.archetype_params
    session_id = str(uuid.uuid4())[:8]
    session_events = []
    is_first_session = state.sessions_total == 0

    state.sessions_total += 1

    # App open
    dt = session_start
    log_event(state, dt, "app_opened", session_id)
    session_events.append(state.events[-1])
    dt += timedelta(minutes=random.uniform(0.5, 2))

    # Number of actions this session
    n_actions = max(1, int(np.random.normal(*arch["events_per_session"])))

    for i in range(n_actions):
        if state.is_suppressed(dt):
            break

        # Decide what happens next based on stage and engagement
        action = _pick_next_action(state, is_first_session and i == 0)
        dt += timedelta(minutes=random.uniform(1, 8))

        if action == "transcription":
            log_event(state, dt, "recording_started", session_id)
            session_events.append(state.events[-1])
            dt += timedelta(minutes=random.uniform(3, 12))

            # Did it error?
            error_prob = CONFIG["base_error_rate"] * (1 + state.consecutive_errors * 0.3)
            if random.random() < error_prob:
                log_event(state, dt, "transcription_error", session_id)
                session_events.append(state.events[-1])
                state.cumulative_errors += 1
                state.consecutive_errors += 1
                if is_first_session:
                    state.error_in_first_session = True

                # Suppression duration depends on archetype error tolerance
                suppress_hours = np.random.exponential(24 * (1 - state.profile["error_tolerance"]))
                state.suppression_until = dt + timedelta(hours=suppress_hours)
                state.current_engagement_energy *= (0.3 + state.profile["error_tolerance"] * 0.4)
                break
            else:
                state.consecutive_errors = 0
                log_event(state, dt, "transcription_completed", session_id)
                session_events.append(state.events[-1])
                state.transcriptions_completed += 1

                # Check milestone
                if state.transcriptions_completed == 1:
                    log_event(state, dt, "first_transcription_completed", session_id)
                    session_events.append(state.events[-1])
                    state.onboarding_stage = max(state.onboarding_stage, 1)

                # Did they accept the AI note?
                accept_prob = 0.4 + state.trust_score * 0.4 - state.profile["skepticism"] * 0.3
                if random.random() < np.clip(accept_prob, 0.05, 0.95):
                    dt += timedelta(minutes=random.uniform(0.5, 2))
                    log_event(state, dt, "ai_note_reviewed", session_id)
                    session_events.append(state.events[-1])
                    log_event(state, dt, "ai_note_accepted", session_id)
                    session_events.append(state.events[-1])
                    state.ai_notes_accepted += 1
                else:
                    log_event(state, dt, "ai_note_edited", session_id)
                    session_events.append(state.events[-1])

                # Update trust score
                if state.transcriptions_completed > 0:
                    state.trust_score = state.ai_notes_accepted / state.transcriptions_completed

                # Value moment check
                if state.transcriptions_completed >= CONFIG["value_moment_threshold"] and state.onboarding_stage < 2:
                    state.onboarding_stage = 2
                    log_event(state, dt, "value_moment_reached", session_id)
                    session_events.append(state.events[-1])
                    state.current_engagement_energy = min(1.0, state.current_engagement_energy + 0.3)

                # Boost engagement
                state.current_engagement_energy = min(1.0, state.current_engagement_energy + 0.1)

        elif action == "feature_explore":
            log_event(state, dt, "feature_discovered", session_id)
            session_events.append(state.events[-1])
            state.features_discovered += 1
            state.current_engagement_energy = min(1.0, state.current_engagement_energy + 0.05)

            if random.random() < 0.3:
                dt += timedelta(minutes=random.uniform(1, 3))
                log_event(state, dt, "template_used", session_id)
                session_events.append(state.events[-1])

        elif action == "help":
            log_event(state, dt, "help_page_opened", session_id)
            session_events.append(state.events[-1])
            state.current_engagement_energy *= 0.9

        elif action == "settings":
            log_event(state, dt, "settings_configured", session_id)
            session_events.append(state.events[-1])

        elif action == "invite" and not state.has_invited and state.onboarding_stage >= 2:
            log_event(state, dt, "colleague_invited", session_id)
            session_events.append(state.events[-1])
            state.has_invited = True
            state.colleagues_invited += 1
            state.current_engagement_energy = min(1.0, state.current_engagement_energy + 0.2)

        # App crash check
        if random.random() < CONFIG["base_crash_rate"]:
            log_event(state, dt, "app_crashed", session_id)
            session_events.append(state.events[-1])
            state.current_engagement_energy *= 0.5
            suppress_hours = random.uniform(12, 48)
            state.suppression_until = dt + timedelta(hours=suppress_hours)
            break

        dt += timedelta(minutes=random.uniform(0.5, 3))

    return session_events

def _pick_next_action(state: DoctorState, is_very_first: bool) -> str:
    """Pick what a doctor does next in a session."""
    if is_very_first or state.transcriptions_completed < 2:
        return "transcription"

    weights = {
        "transcription":  0.55 + state.trust_score * 0.2,
        "feature_explore": 0.20 + state.features_discovered * -0.02,
        "help":           0.08,
        "settings":       0.05,
        "invite":         state.profile["invite_colleague_prob"] * 0.15 if state.onboarding_stage >= 2 else 0.0,
    }
    total = sum(weights.values())
    choices = list(weights.keys())
    probs = [v / total for v in weights.values()]
    return np.random.choice(choices, p=probs)

# ─────────────────────────────────────────────
# MAIN DOCTOR SIMULATION
# ─────────────────────────────────────────────

def simulate_doctor(doc_id: str, archetype: str, signup_date: datetime) -> Tuple[Dict, List[Dict]]:
    """Simulate one doctor's full 8-week journey."""
    arch_params = ARCHETYPES[archetype]
    profile = generate_doctor_profile(doc_id, archetype, signup_date)
    state = DoctorState(
        doc_id=doc_id,
        profile=profile,
        archetype_params=arch_params,
        signup_dt=signup_date,
        current_engagement_energy=profile["base_engagement"],
    )

    # Time to first action — skeptical doctors take longer
    days_to_first = max(0.1, np.random.normal(*arch_params["time_to_first_action"]))

    for day in range(CONFIG["simulation_days"]):
        current_date = signup_date + timedelta(days=day)

        # Churn check
        if state.last_activity_dt is not None:
            state.days_since_last_activity = (current_date - state.last_activity_dt).total_seconds() / 86400
            if state.days_since_last_activity >= CONFIG["churn_gap_days"] and not state.churned:
                state.churned = True
                state.churn_dt = current_date
                log_event(state, current_date, "churned", "system")
                # Some churned doctors reactivate
                if random.random() < 0.12:
                    state.reactivated = True
                else:
                    break

        # Calendar drip emails
        for drip_day in CONFIG["calendar_drip_days"]:
            if day == drip_day and drip_day not in state.drip_days_sent:
                email_dt = current_date.replace(hour=9, minute=0)
                email_cat = determine_email_category(state)
                log_event(state, email_dt, "email_sent", "drip_system",
                          extra={"email_category": email_cat, "email_category_name": EMAIL_CATEGORIES[email_cat]})
                state.emails_sent_total += 1
                state.drip_days_sent.append(drip_day)
                state.last_email_dt = email_dt

                # Doctor response
                if should_open_email(state):
                    open_dt = email_dt + timedelta(minutes=random.uniform(5, 120))
                    log_event(state, open_dt, "email_opened", "drip_system",
                              extra={"email_category": email_cat})
                    state.emails_ignored_streak = 0
                    state.current_engagement_energy = min(1.0, state.current_engagement_energy + 0.05)

                    if random.random() < 0.4:
                        click_dt = open_dt + timedelta(minutes=random.uniform(1, 10))
                        log_event(state, click_dt, "email_clicked", "drip_system",
                                  extra={"email_category": email_cat})
                else:
                    log_event(state, email_dt + timedelta(hours=49), "email_ignored", "drip_system",
                              extra={"email_category": email_cat})
                    state.emails_ignored_streak += 1
                    state.emails_ignored_total += 1
                    # Non-linear fatigue — this is key complexity for LSTM
                    fatigue_factor = state.emails_ignored_streak ** 1.3 * state.profile["fatigue_sensitivity"]
                    state.current_engagement_energy *= max(0.1, 1.0 - fatigue_factor * 0.1)

        # Did doctor skip first action period
        if day < days_to_first:
            continue

        # Is this an active day?
        is_weekend = current_date.weekday() >= 5
        if is_weekend and random.random() > arch_params["weekend_activity_prob"]:
            continue

        # Sessions today
        if state.is_suppressed(current_date):
            continue

        n_sessions_today = max(0, int(np.random.normal(*arch_params["sessions_per_active_day"])))

        # Engagement modulates session probability
        n_sessions_today = int(n_sessions_today * state.effective_engagement() * 1.5)

        if n_sessions_today == 0:
            continue

        state.active_days += 1
        if state.last_session_dt and (current_date - state.last_session_dt).days <= 1:
            state.consecutive_days_active += 1
        else:
            state.consecutive_days_active = 1

        # Simulate each session
        for s in range(n_sessions_today):
            session_hour = _pick_session_hour(arch_params, current_date)
            session_start = current_date.replace(hour=session_hour, minute=random.randint(0, 59))
            simulate_session(state, session_start)

        state.last_session_dt = current_date

        # Habit check
        if state.consecutive_days_active >= 3 and state.onboarding_stage < 3:
            state.onboarding_stage = 3
            log_event(state, current_date, "habit_formed", "system")

        # Conversion check
        if state.onboarding_stage >= 2 and not state.converted:
            conv_prob = arch_params["base_conversion_prob"] * state.trust_score * (1 + state.colleagues_invited * 0.2)
            if random.random() < np.clip(conv_prob / CONFIG["simulation_days"], 0, 0.15):
                state.converted = True

        # Natural engagement decay — daily drift toward baseline
        baseline = profile["base_engagement"]
        state.current_engagement_energy += (baseline - state.current_engagement_energy) * 0.05

    return profile, state.events

def _pick_session_hour(arch_params: Dict, date: datetime) -> int:
    """Pick a session start hour from this archetype's clinic windows."""
    windows = arch_params["clinic_hours"]
    window = random.choice(windows)
    return random.randint(window[0], window[1] - 1)

# ─────────────────────────────────────────────
# RUN FULL SIMULATION
# ─────────────────────────────────────────────

def run_simulation() -> Tuple[pd.DataFrame, pd.DataFrame]:
    np.random.seed(CONFIG["random_seed"])
    random.seed(CONFIG["random_seed"])

    all_profiles = []
    all_events = []

    archetype_names = list(CONFIG["archetype_distribution"].keys())
    archetype_probs = list(CONFIG["archetype_distribution"].values())

    print(f"Simulating {CONFIG['n_doctors']} doctors over {CONFIG['simulation_days']} days...")

    base_signup = datetime(2024, 1, 1, 8, 0, 0)

    for i in range(CONFIG["n_doctors"]):
        if i % 1000 == 0:
            print(f"  {i}/{CONFIG['n_doctors']} doctors generated...")

        doc_id = f"doc_{i:05d}"
        archetype = np.random.choice(archetype_names, p=archetype_probs)

        # Stagger signups over 30 days so cohorts aren't all identical
        signup_offset = random.randint(0, 30)
        signup_date = base_signup + timedelta(days=signup_offset)

        profile, events = simulate_doctor(doc_id, archetype, signup_date)
        all_profiles.append(profile)
        all_events.extend(events)

    profiles_df = pd.DataFrame(all_profiles)
    events_df = pd.DataFrame(all_events)

    # Sort events globally by timestamp
    events_df["timestamp"] = pd.to_datetime(events_df["timestamp"], format='ISO8601')
    events_df = events_df.sort_values(["doc_id", "timestamp"]).reset_index(drop=True)

    print(f"\nSimulation complete.")
    print(f"  Doctors:       {len(profiles_df)}")
    print(f"  Total events:  {len(events_df)}")
    print(f"  Avg events/dr: {len(events_df) / len(profiles_df):.1f}")
    print(f"\nConversion rates by archetype:")
    merged = events_df.groupby("doc_id").last()[["converted"]].reset_index()
    merged = merged.merge(profiles_df[["doc_id", "archetype"]], on="doc_id")
    print(merged.groupby("archetype")["converted"].mean().round(3).to_string())

    return profiles_df, events_df

# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    os.makedirs(CONFIG["output_dir"], exist_ok=True)

    profiles_df, events_df = run_simulation()

    profiles_path = os.path.join(CONFIG["output_dir"], "doctor_profiles.csv")
    events_path   = os.path.join(CONFIG["output_dir"], "doctor_events.csv")
    config_path   = os.path.join(CONFIG["output_dir"], "simulation_config.json")

    profiles_df.to_csv(profiles_path, index=False)
    events_df.to_csv(events_path, index=False)

    with open(config_path, "w") as f:
        json.dump(CONFIG, f, indent=2)

    print(f"\nFiles saved:")
    print(f"  {profiles_path}")
    print(f"  {events_path}")
    print(f"  {config_path}")

    # Quick sanity stats
    print(f"\nEvent type distribution (top 15):")
    print(events_df["event_type"].value_counts().head(15).to_string())

    print(f"\nOnboarding stage distribution (final state per doctor):")
    final_stage = events_df.groupby("doc_id")["onboarding_stage"].last()
    print(final_stage.value_counts().sort_index().to_string())