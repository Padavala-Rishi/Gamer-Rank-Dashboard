import { useState, type ReactNode } from "react";
import { Lightbulb } from "lucide-react";
import { useApi, useDocumentTitle, useProfile } from "../lib/hooks";
import { Async, Card, PageHeader, Seg } from "../components/ui";
import { BarChart, BarList, LineChart } from "../components/charts";
import { PaceBadge } from "../components/entities";
import { Progress } from "../components/ui";
import { fmtMin, pct } from "../lib/format";
import { formatMoney } from "../../shared/finance";
import { EVENT_KINDS, label } from "../../shared/constants";

type Summary = Record<string, number | null>;
interface AnalyticsData {
  range: { from: string; to: string; days: number; bucket: "day" | "week" };
  chart: { dates: string[]; series: Record<string, (number | null)[]> };
  summary: Summary;
  previous: Summary;
  insights: { text: string; decision: string }[];
  allocation: { area: string; color: string; minutes: number }[];
  calendar_by_kind: Record<string, number>;
  goals: { id: string; title: string; progress: number | null; pace: string; expected: number | null; is_focus: boolean }[];
  habits: { id: string; title: string; consistency: number | null; streak: number; unit: string }[];
  projects_completed: number;
  tasks_created: number;
  overdue_open: number;
  finance: { m: string; income: number; expenses: number }[];
}

function delta(cur: number | null | undefined, prev: number | null | undefined, higherIsBetter = true, fmt: (n: number) => string = (n) => String(Math.round(n))) {
  if (cur == null || prev == null) return { text: null, good: null };
  const d = cur - prev;
  if (Math.abs(d) < 0.05) return { text: "Same as previous period", good: null };
  return { text: `${d > 0 ? "▲" : "▼"} ${fmt(Math.abs(d))} vs previous period`, good: higherIsBetter ? d > 0 : d < 0 };
}

export default function Analytics() {
  useDocumentTitle("Analytics");
  const [range, setRange] = useState("30");
  const q = useApi<AnalyticsData>(`/analytics?range=${range}`);
  const profile = useProfile();
  const cur = profile.data?.currency ?? "INR";
  return (
    <div className="page">
      <PageHeader
        title="Analytics"
        subtitle="Every number here should help you decide something. Patterns are correlations in your own data — not causes."
        actions={<Seg label="Range" value={range} onChange={setRange} options={[["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["365", "1 year"]]} />}
      />
      <Async q={q} lines={10}>
        {(d) => {
          const s = d.summary;
          const p = d.previous;
          const bucket = d.range.bucket === "week" ? "per week" : "per day";
          const tiles: [string, ReactNode, ReturnType<typeof delta>][] = [
            ["Tasks completed", s.tasks_done, delta(s.tasks_done, p.tasks_done)],
            ["Important completed", s.important_done, delta(s.important_done, p.important_done)],
            ["Deep work", fmtMin(s.focus_min), delta(s.focus_min, p.focus_min, true, fmtMin)],
            ["Learning", fmtMin(s.study_min), delta(s.study_min, p.study_min, true, fmtMin)],
            ["Habit consistency", pct(s.habit_rate), delta(s.habit_rate, p.habit_rate, true, (n) => `${Math.round(n * 100)} pts`)],
            ["Exercise days", s.exercise_days, delta(s.exercise_days, p.exercise_days)],
            ["Avg sleep", s.sleep_avg == null ? "—" : `${s.sleep_avg}h`, delta(s.sleep_avg, p.sleep_avg, true, (n) => `${n.toFixed(1)}h`)],
            ["Avg mood", s.mood_avg == null ? "—" : `${s.mood_avg}/5`, delta(s.mood_avg, p.mood_avg, true, (n) => n.toFixed(1))],
            ["Distractions", s.distractions, delta(s.distractions, p.distractions, false)],
          ];
          return (
            <div className="col gap-16">
              <div className="stats-row card card-pad" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {tiles.map(([l, v, dl]) => (
                  <div key={l} className="stat">
                    <span className="stat-label">{l}</span>
                    <span className="stat-value">{v ?? 0}</span>
                    {dl.text && <span className={`stat-delta ${dl.good == null ? "" : dl.good ? "up" : "down"}`}>{dl.text}</span>}
                  </div>
                ))}
              </div>

              {d.insights.length > 0 && (
                <Card title="Patterns in your data" icon={<Lightbulb size={15} aria-hidden />} className="accent">
                  <div className="col gap-12">
                    {d.insights.map((i, k) => (
                      <div key={k}>
                        <p>{i.text}</p>
                        <p className="small muted">→ {i.decision}</p>
                      </div>
                    ))}
                    <p className="tiny muted">Based on days where both values were logged. Correlation, not causation — treat these as experiments to try.</p>
                  </div>
                </Card>
              )}

              <div className="grid grid-2">
                <ChartCard title={`Tasks completed ${bucket}`} decision="Is your output steady, or boom-and-bust? Steady usually beats heroic.">
                  <BarChart label="Tasks completed" dates={d.chart.dates} values={d.chart.series.tasks_done} />
                </ChartCard>
                <ChartCard title={`Deep work ${bucket}`} decision="Protect the days and times where deep work actually happens.">
                  <BarChart label="Deep work minutes" dates={d.chart.dates} values={d.chart.series.focus_min} format={(v) => fmtMin(v)} />
                </ChartCard>
                <ChartCard title="Habit completion rate" decision="If it's dropping, shrink the minimum version rather than adding willpower.">
                  <LineChart label="Habit completion" dates={d.chart.dates} values={d.chart.series.habit_rate} max={1} format={(v) => `${Math.round(v * 100)}%`} />
                </ChartCard>
                <ChartCard title="Sleep (hours)" decision="Sleep is the cheapest performance lever. Is it consistent?">
                  <LineChart label="Sleep" dates={d.chart.dates} values={d.chart.series.sleep_hours} max={10} format={(v) => `${Math.round(v * 10) / 10}h`} />
                </ChartCard>
                <ChartCard title="Mood (1–5)" decision="Notice what's around your low points — the journal can tell you why.">
                  <LineChart label="Mood" dates={d.chart.dates} values={d.chart.series.mood} max={5} />
                </ChartCard>
                <ChartCard title={`Exercise ${bucket}`} decision="Enough movement to feel good? Aim for consistency over intensity.">
                  <BarChart label="Exercise minutes" dates={d.chart.dates} values={d.chart.series.exercise_min} format={(v) => fmtMin(v)} />
                </ChartCard>
                <ChartCard title={`Learning ${bucket}`} decision="Is study time matching your exam and learning deadlines?">
                  <BarChart label="Study minutes" dates={d.chart.dates} values={d.chart.series.study_min} format={(v) => fmtMin(v)} />
                </ChartCard>
                <ChartCard title={`Distractions logged ${bucket}`} decision="Rising? Change the environment (phone, notifications) before blaming yourself.">
                  <BarChart label="Distractions" dates={d.chart.dates} values={d.chart.series.distractions} color="var(--p-high)" />
                </ChartCard>
              </div>

              <div className="grid grid-2">
                <ChartCard title="Where focus time went (by life area)" decision="Does this match what you said matters most?">
                  <BarList items={d.allocation.map((a) => ({ label: a.area, value: a.minutes, color: a.color }))} format={fmtMin} empty="No completed focus sessions in this period." />
                </ChartCard>
                <ChartCard title="Scheduled time by type" decision="Meetings and admin crowding out deep work? Block focus time first.">
                  <BarList items={Object.entries(d.calendar_by_kind).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: label(EVENT_KINDS, k), value: v }))} format={fmtMin} empty="No one-off calendar events in this period." />
                </ChartCard>
                <ChartCard title="Goal progress" decision="Goals behind pace need a decision: more time, smaller scope, or a later deadline.">
                  <div className="col gap-12">
                    {d.goals.map((g) => (
                      <div key={g.id}>
                        <div className="row between small">
                          <span className="ellipsis">{g.title}</span>
                          <PaceBadge pace={g.pace} />
                        </div>
                        <div className="mt-4">
                          <Progress value={g.progress} expected={g.expected} label={g.title} />
                        </div>
                      </div>
                    ))}
                    {!d.goals.length && <p className="small muted">No active goals.</p>}
                  </div>
                </ChartCard>
                <ChartCard title="Habit consistency (30 days)" decision="Keep the strong ones; redesign the weakest one this week.">
                  <BarList items={d.habits.map((h) => ({ label: `${h.title}${h.streak ? ` · ${h.streak}${h.unit === "weeks" ? "w" : "d"} streak` : ""}`, value: Math.round((h.consistency ?? 0) * 100) }))} format={(v) => `${v}%`} empty="No habits yet." />
                </ChartCard>
                <ChartCard title="Execution health" decision="Creating far more tasks than you finish means the list needs pruning, not more effort.">
                  <div className="stats-row">
                    <div className="stat">
                      <span className="stat-label">Created</span>
                      <span className="stat-value">{d.tasks_created}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Completed</span>
                      <span className="stat-value">{s.tasks_done}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Overdue now</span>
                      <span className="stat-value">{d.overdue_open}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Projects completed</span>
                      <span className="stat-value">{d.projects_completed}</span>
                    </div>
                  </div>
                </ChartCard>
                <ChartCard title="Money in / out" decision="Is the monthly surplus moving your financial goals at the pace you want?">
                  {d.finance.length === 0 ? (
                    <p className="small muted">No transactions in this period.</p>
                  ) : (
                    <table className="small num" style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr className="muted">
                          <th style={{ textAlign: "left", fontWeight: 500 }}>Month</th>
                          <th style={{ textAlign: "right", fontWeight: 500 }}>In</th>
                          <th style={{ textAlign: "right", fontWeight: 500 }}>Out</th>
                          <th style={{ textAlign: "right", fontWeight: 500 }}>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.finance.map((f) => (
                          <tr key={f.m} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "6px 0" }}>{f.m}</td>
                            <td style={{ textAlign: "right" }}>{formatMoney(f.income, cur, true)}</td>
                            <td style={{ textAlign: "right" }}>{formatMoney(f.expenses, cur, true)}</td>
                            <td style={{ textAlign: "right", color: f.income - f.expenses >= 0 ? "var(--good)" : "var(--bad)" }}>{formatMoney(f.income - f.expenses, cur, true)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </ChartCard>
              </div>
            </div>
          );
        }}
      </Async>
    </div>
  );
}

function ChartCard({ title, decision, children }: { title: string; decision: string; children: ReactNode }) {
  return (
    <Card title={title}>
      {children}
      <p className="tiny muted mt-8">Decision this supports: {decision}</p>
    </Card>
  );
}
