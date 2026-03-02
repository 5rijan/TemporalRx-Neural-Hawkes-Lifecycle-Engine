# TemporalRx: Neural Hawkes Lifecycle Engine

Real-time lifecycle intervention using a Neural Hawkes Process + LSTM. Given a user's event history, the model predicts when to intervene (48h intensity curve), what to send (5-class email category), and whether they'll convert — all updating incrementally with each new event.

Live dashboard: https://temporal-rx-neural-hawkes-lifecycle.vercel.app  
Technical report: `TemporalRx-Technical Report.pdf`

---

## How it works

Standard Hawkes processes use fixed parameters for base intensity and decay rate. This model conditions both on the LSTM hidden state, so each user gets a personalised intensity curve based on their own history rather than a population average.

Each new event runs a single LSTM step from the saved hidden state `(h_t, c_t)` - no reprocessing the full history. Inference is O(1) per event.

Three output heads share the same LSTM backbone:
- **Hawkes head** — intensity curve λ(t) over 48h, primary + secondary send windows
- **Conversion head** — binary classifier on `concat(h_t, c_t)`
- **Email head** — 5-class softmax (activation, expansion, social, recovery, commitment)

---

![Training UI Screenshot](train/Screenshot%202026-03-02%20at%2012.50.14%E2%80%AFpm.png)


## Structure

```
api/
  main.py                   FastAPI service, all inference happens here
  Requirements_api.txt

data/
  synthetic_data_generator.py
  outputs/
    doctor_events.csv       1.33M events
    doctor_profiles.csv     10k user profiles
    simulation_config.json

model/
  temporalrx_model.pt       trained weights
  temporalrx_scaler.pkl     StandardScaler for continuous features

train/
  train.ipynb               training notebook
  training_curves.png

ui/temporalrx/
  lib/api.ts                API client — change base URL here for local dev
  hooks/useTemporalRx.ts    all data fetching hooks
  components/doctors/       table, modal, intensity curve, simulator, history
  types/index.ts
```

---

## Running locally

Two terminals required.

**Terminal 1 — API**

```bash
cd api
pip install -r Requirements_api.txt
uvicorn main:app --reload --port 8000
```

API expects model and data files at these paths relative to `api/`:
```
../model/temporalrx_model.pt
../model/temporalrx_scaler.pkl
../data/outputs/doctor_events.csv
../data/outputs/doctor_profiles.csv
```

Docs at `http://localhost:8000/docs`

**Terminal 2 — Dashboard**

Before starting, open `ui/temporalrx/lib/api.ts` and switch the base URL to localhost:

```typescript
// change this
const API_BASE = "https://api.chsrijan.com";

// to this
const API_BASE = "http://localhost:8000";
```

Then:

```bash
cd ui/temporalrx
npm install
npm run dev
```

Dashboard at `http://localhost:3000`

---

## Model

40,976 parameters. Trained on 1.33M synthetic events across 10k users.

Loss: `NLL (Hawkes) + 0.5 × BCE (conversion) + 0.3 × CE (email category)`

Conversion class imbalance (5.7% positive) handled with `pos_weight = 16.42`.

Test accuracy: 80.5% conversion, ~98% email category (synthetic data distribution).

Training from scratch takes ~45 min on CPU. Run the notebook in `train/train.ipynb` sequentially, data needs to exist in `data/outputs/` first.

---

## Notes

- Trained on synthetic data. Conversion head would need retraining on real outcome data.
- LSTM hidden states are stored in memory, lost on API restart. Would need Redis for production.
- API is hosted on a Raspberry Pi 5 so the live demo may occasionally be offline. If so, follow the local setup above or open an issue.