# TemporalRx

**Neural Hawkes Process · LSTM · Real-Time Sequence Modelling**

A custom-built neural architecture that combines a Long Short-Term Memory network with a Neural Hawkes Process to model temporal event sequences and predict optimal intervention windows. Given a user's full event history, the model simultaneously outputs a 48-hour engagement intensity forecast λ(t), a conversion probability, and an intervention category — all updating in real time as new events arrive.

Live dashboard → [temporal-rx-neural-hawkes-lifecycle.vercel.app](https://temporal-rx-neural-hawkes-lifecycle.vercel.app/)  
Technical report → [`TemporalRx-Technical Report.pdf`](./TemporalRx-Technical%20Report.pdf)

---

## What It Does

Most lifecycle intervention systems operate on fixed schedules — send message at day 1, day 3, day 7. This ignores everything about what the user is actually doing. TemporalRx replaces the schedule with a learned model of individual engagement dynamics.

For each user and each new event, the model predicts:

- **When** — a 48-hour intensity curve λ(t) with primary and secondary optimal send windows
- **What** — one of five intervention categories (activation, expansion, social, recovery, commitment)
- **Whether** — probability that this user converts, updated live

The key architectural contribution is conditioning the Hawkes process base intensity and decay rate on the LSTM hidden state rather than treating them as fixed scalars. This means every user gets a personalised curve shape learned from their own event history, not a population average.

---

## Architecture

```
Event sequence
      │
      ▼
┌─────────────────────┐
│   Input Encoder     │  Categorical embeddings (56-dim)
│                     │  + Continuous projection (56-dim)
│                     │  → Linear(112, 128) → LayerNorm → ReLU
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   LSTM Encoder      │  hidden_size = 32, 1 layer
│                     │  → h_t ∈ ℝ³²  (short-term)
│                     │  → c_t ∈ ℝ³²  (long-term)
└──────────┬──────────┘
           │
     ┌─────┼──────┐
     ▼     ▼      ▼
 Hawkes  Conv   Email
  Head   Head   Head
```

**Neural Hawkes Head**

```
λ(t) = softplus(f_base(h_t)) · exp(-softplus(f_decay(h_t)) · Δt)
```

`f_base` and `f_decay` are small feedforward networks — the decay rate and base intensity are functions of the LSTM hidden state, not constants.

**Conversion Head** — binary classifier on `concat(h_t, c_t) ∈ ℝ⁶⁴`

**Email Category Head** — 5-class softmax on the same context vector

---

## Incremental Inference

The LSTM hidden state `(h_t, c_t)` is saved per user after each event. When a new event arrives, a single LSTM step continues from the saved state. This makes inference **O(1) per event** regardless of history length — no reprocessing needed.

---

## Project Structure

```
TemporalRx/
├── TemporalRx-Technical Report.pdf   # Full technical writeup
│
├── data/
│   ├── synthetic_data_generator.py   # Generates event sequences
│   └── outputs/
│       ├── doctor_events.csv         # 1.33M event rows
│       ├── doctor_profiles.csv       # 10,000 user profiles
│       └── simulation_config.json    # Generator parameters
│
├── model/
│   ├── temporalrx_model.pt           # Trained PyTorch weights
│   └── temporalrx_scaler.pkl         # StandardScaler for features
│
├── train/
│   ├── train.ipynb                   # Training notebook (7 chunks)
│   └── training_curves.png           # Loss curves
│
├── api/
│   ├── main.py                       # FastAPI service
│   └── Requirements_api.txt          # Python dependencies
│
└── ui/temporalrx/                    # Next.js dashboard
    ├── app/
    ├── components/
    │   ├── doctors/                  # DoctorsTable, DoctorModal,
    │   │                             # IntensityCurve, InterventionPanel,
    │   │                             # SimulatorPanel, EventHistory
    │   └── shared/                   # ArchetypeBadge, StagePill, MiniBar
    ├── hooks/useTemporalRx.ts        # All API interaction hooks
    ├── lib/api.ts                    # Typed API client
    └── types/index.ts                # Shared TypeScript interfaces
```

---

## Running Locally

You need two terminals — one for the API, one for the dashboard.

### 1. API (Terminal 1)

```bash
cd api
pip install -r Requirements_api.txt

uvicorn main:app --reload --port 8000
```

The API expects these paths relative to `api/`:

```
../model/temporalrx_model.pt
../model/temporalrx_scaler.pkl
../data/outputs/doctor_events.csv
../data/outputs/doctor_profiles.csv
```

On startup you should see:

```
Loading model...
Loading scaler...
Loading data...
✓ Startup complete
```

Interactive API docs available at `http://localhost:8000/docs`

---

### 2. Dashboard (Terminal 2)

**Before running, update the API base URL.**

Open `ui/temporalrx/lib/api.ts` and change:

```typescript
// Default (points to hosted API)
const API_BASE = "https://api.chsrijan.com";

// Change to this for local development
const API_BASE = "http://localhost:8000";
```

Then:

```bash
cd ui/temporalrx
npm install
npm run dev
```

Dashboard available at `http://localhost:3000`

The header will show **API connected** in green once it can reach the local API server.

---

### 3. Generate Fresh Training Data (Optional)

If you want to regenerate the synthetic dataset from scratch:

```bash
cd data
python synthetic_data_generator.py
# Outputs to data/outputs/
```

---

### 4. Retrain the Model (Optional)

Open `train/train.ipynb` and run the 7 chunks in order. The notebook expects the CSV files to exist in `data/outputs/` and saves weights to `model/`.

Training on CPU takes approximately 45 minutes on 10,000 users.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Model status and doctor count |
| `GET` | `/doctors` | Paginated user list with filters |
| `GET` | `/doctor/{id}` | Full profile and current state |
| `POST` | `/doctor/{id}/predict` | Full inference on complete history |
| `POST` | `/doctor/{id}/event` | Incremental inference — single new event |
| `GET` | `/doctor/{id}/history` | Last N events for a user |
| `GET` | `/population/stats` | Aggregate metrics across all users |
| `POST` | `/simulate/stream` | Replay N events, return prediction snapshots |

---

## Training Details

| | |
|---|---|
| Architecture | Neural Hawkes LSTM |
| Parameters | 40,976 |
| Training users | 10,000 (synthetic) |
| Training events | 1,332,818 |
| LSTM hidden size | 32 |
| Input dim | 128 (after encoding) |
| Loss | NLL (Hawkes) + 0.5 × BCE (conversion) + 0.3 × CE (email) |
| Optimiser | Adam, lr=1e-3, gradient clipping 1.0 |
| Conversion accuracy | 80.5% (test) |
| Inference latency | <50ms on CPU |

Class imbalance in the conversion head (5.7% positive rate) is corrected with `pos_weight = 16.42`.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Model | PyTorch 2.x |
| API | FastAPI + Uvicorn |
| Dashboard | Next.js 14, TypeScript |
| UI components | Shadcn UI, Tailwind CSS |
| Charts | Recharts |
| Deployment (API) | Raspberry Pi 5 / local |
| Deployment (UI) | Vercel |

---

## Known Limitations

- **Synthetic data** — trained on generated events, not real user logs. Connecting to a real event stream would require retraining the conversion head on real outcome data.
- **In-memory state store** — LSTM hidden states are stored in a Python dict and lost on restart. Production use would need Redis or equivalent.
- **Email category distribution** — skews toward recovery and commitment in synthetic data. A balanced real-world dataset would give the category head a harder and more representative task.

---

## References

- Mei & Eisner (2017). *The Neural Hawkes Process: A Neurally Self-Modulating Multivariate Point Process.* NeurIPS.
- Du et al. (2016). *Recurrent Marked Temporal Point Processes.* KDD.
- Shchur et al. (2020). *Intensity-Free Learning of Temporal Point Processes.* ICLR.

---

## Author

**Srijan Chaudhary**