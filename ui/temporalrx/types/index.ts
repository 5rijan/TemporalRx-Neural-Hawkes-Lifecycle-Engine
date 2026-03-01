export type Archetype =
  | "early_adopter"
  | "skeptical_senior"
  | "busy_registrar"
  | "passive_tryer"
  | "champion";

export interface DoctorSummary {
  doc_id: string;
  archetype: Archetype;
  job_title: string;
  specialty: string;
  practice_type: string;
  plan_type?: string;
  event_count: number;
  last_event_at: string;
  converted: boolean;
  churned: boolean;
  current_stage: number;
  base_engagement: number;
  churn_risk: number;
  skepticism?: number;
  error_tolerance?: number;
  fatigue_sensitivity?: number;
}

export interface DoctorProfile {
  doc_id: string;
  profile: DoctorSummary;
  current_state: {
    onboarding_stage: number;
    onboarding_stage_label: string;
    transcriptions_completed: number;
    features_discovered: number;
    trust_score: number;
    engagement_energy: number;
    emails_ignored_streak: number;
    days_since_last_activity: number;
    cumulative_errors: number;
    converted: boolean;
    churned: boolean;
    total_events: number;
    active_days: number;
  };
  journey_summary: { signup_date: string; days_observed: number };
}

export interface HistoryEvent {
  event_id: string;
  event_type: string;
  event_category: string;
  event_valence: number;
  timestamp: string;
  time_since_signup_days: number;
  hour_of_day: number;
  onboarding_stage: number;
  engagement_energy: number;
  emails_ignored_streak: number;
}

export interface Prediction {
  doc_id: string;
  generated_at: string;
  curve: { time_points: number[]; intensities: number[] };
  primary_window: SendWindow;
  secondary_window: SendWindow;
  intervention: {
    channel: string;
    email_category: string;
    email_confidence: number;
    message: string;
    trigger_now: boolean;
    category_probs: Record<string, number>;
  };
  conversion: { probability: number; percentage: number };
  triggering_event?: string;
  recommendation_changed?: boolean;
}

export interface SendWindow {
  hours_from_now: number;
  send_at: string;
  intensity: number;
  confidence: number;
}

export interface SimulateStep extends Prediction {
  step: number;
  triggering_event: string;
}