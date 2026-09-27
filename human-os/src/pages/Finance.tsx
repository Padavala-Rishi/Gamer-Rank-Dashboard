import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Wallet } from "lucide-react";
import { useApi, useDocumentTitle, useProfile, useToday } from "../lib/hooks";
import type { Account, Budget, FinancialGoal, Subscription, Transaction } from "../lib/types";
import { Async, Button, Card, Empty, PageHeader, Progress, Stat, Tabs } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { accountFields, budgetFields, finGoalFields, subscriptionFields, transactionFields } from "../lib/fields";
import { BarList } from "../components/charts";
import { ACCOUNT_KINDS, BILLING_CYCLES, FIN_GOAL_KINDS, label } from "../../shared/constants";
import { formatMoney, monthlyEquivalent, type Projection } from "../../shared/finance";
import { addMonths } from "../../shared/dates";
import { fmtDate } from "../lib/format";

interface Summary {
  month: string;
  accounts: (Account & { balance: number; liability: boolean })[];
  assets: number;
  debts: number;
  net_worth: number;
  income: number;
  expenses: number;
  savings_rate: number | null;
  by_category: Record<string, number>;
  budgets: (Budget & { spent: number })[];
  subscriptions: Subscription[];
  subscriptions_monthly: number;
  goals: (FinancialGoal & { current: number; projection: Projection })[];
  history: { month: string; income: number; expenses: number }[];
  transactions: Transaction[];
}

type Modal = null | { kind: "account" | "transaction" | "budget" | "subscription" | "goal"; initial: Record<string, unknown> };

export default function Finance() {
  useDocumentTitle("Finance");
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");
  const [tab, setTab] = useState<"overview" | "transactions" | "subscriptions">("overview");
  const q = useApi<Summary>(`/finance/summary?month=${month}`);
  const profile = useProfile();
  const cur = profile.data?.currency ?? "INR";
  const money = (n: number, compact = false) => formatMoney(n, cur, compact);
  const [modal, setModal] = useState<Modal>(null);
  const forms = {
    account: { t: "Account", r: "accounts", f: accountFields },
    transaction: { t: "Transaction", r: "transactions", f: transactionFields },
    budget: { t: "Budget", r: "budgets", f: budgetFields },
    subscription: { t: "Subscription", r: "subscriptions", f: subscriptionFields },
    goal: { t: "Financial goal", r: "financial-goals", f: finGoalFields },
  };
  const form = modal ? forms[modal.kind] : null;
  const monthLabel = new Date(month + "T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="page">
      <PageHeader
        title="Finance"
        subtitle="See where money goes, and whether it's going where you want."
        actions={
          <>
            <Button onClick={() => setModal({ kind: "account", initial: {} })}>
              <Plus size={15} aria-hidden /> Account
            </Button>
            <Button variant="primary" onClick={() => setModal({ kind: "transaction", initial: { kind: "expense" } })} disabled={!q.data?.accounts.length} title={!q.data?.accounts.length ? "Add an account first" : undefined}>
              <Plus size={15} aria-hidden /> Transaction
            </Button>
          </>
        }
      />
      <Async q={q}>
        {(d) =>
          d.accounts.length === 0 ? (
            <Card>
              <Empty icon={<Wallet size={20} />} title="Start with an account" action={<Button variant="primary" onClick={() => setModal({ kind: "account", initial: {} })}>Add your first account</Button>}>
                Add your bank account, cash, savings — even a loan. Balances update from the transactions you log.
              </Empty>
            </Card>
          ) : (
            <div className="col gap-16">
              <div className="grid grid-4">
                <Card pad>
                  <Stat label="Net worth" value={money(d.net_worth, true)} delta={`${money(d.assets, true)} assets · ${money(d.debts, true)} debts`} />
                </Card>
                <Card pad>
                  <Stat label={`Income · ${monthLabel}`} value={money(d.income, true)} />
                </Card>
                <Card pad>
                  <Stat label="Expenses" value={money(d.expenses, true)} delta={d.savings_rate != null ? `Savings rate ${Math.round(d.savings_rate * 100)}%` : null} deltaGood={d.savings_rate == null ? null : d.savings_rate >= 0.1} />
                </Card>
                <Card pad>
                  <Stat label="Subscriptions" value={money(d.subscriptions_monthly, true)} unit="/mo" delta={`${money(d.subscriptions_monthly * 12, true)} per year`} />
                </Card>
              </div>
              <div className="row between wrap">
                <Tabs label="Finance sections" value={tab} onChange={setTab} options={[["overview", "Overview"], ["transactions", "Transactions"], ["subscriptions", "Subscriptions"]]} />
                <div className="row">
                  <Button icon onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="strong">{monthLabel}</span>
                  <Button icon onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month" disabled={month.slice(0, 7) >= today.slice(0, 7)}>
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
              {tab === "overview" && (
                <div className="dash">
                  <div className="col" style={{ gap: "var(--space)" }}>
                    <Card title="Financial goals" actions={<Button size="sm" variant="ghost" onClick={() => setModal({ kind: "goal", initial: {} })}><Plus size={14} aria-hidden /> Goal</Button>}>
                      {d.goals.length === 0 ? (
                        <p className="small muted">E.g. build an emergency fund, save for a laptop, invest monthly, pay off a loan.</p>
                      ) : (
                        <div className="col gap-16">
                          {d.goals.map((g) => {
                            const p = g.projection;
                            return (
                              <button key={g.id} className="col gap-4" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setModal({ kind: "goal", initial: g as unknown as Record<string, unknown> })}>
                                <div className="row between">
                                  <span className="strong">{g.title}</span>
                                  <span className="badge">{label(FIN_GOAL_KINDS, g.kind)}</span>
                                </div>
                                <Progress value={p.progress} tone={p.onTrack === false ? "warn" : undefined} label={`${g.title} progress`} />
                                <div className="meta">
                                  <span>
                                    {money(p.current)} of {money(p.target)}
                                  </span>
                                  <span>Gap {money(p.gap)}</span>
                                  {p.eta && p.gap > 0 && <span>At {money(g.monthly_contribution ?? 0)}/mo: ~{fmtDate(p.eta, today)}</span>}
                                  {p.gap > 0 && !p.eta && <span>Set a monthly contribution to see a timeline</span>}
                                  {g.deadline && p.requiredMonthly != null && p.gap > 0 && (
                                    <span style={{ color: p.onTrack ? "var(--good)" : "var(--warn)" }}>
                                      {p.onTrack ? "On track" : `Needs ~${money(p.requiredMonthly)}/mo`} for {fmtDate(g.deadline, today)}
                                    </span>
                                  )}
                                  {p.gap === 0 && <span style={{ color: "var(--good)" }}>Reached</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                    <Card title="Spending by category">
                      <BarList items={Object.entries(d.by_category).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }))} format={(v) => money(v)} empty="No expenses this month." />
                    </Card>
                    <Card title="Cash flow (6 months)">
                      <table className="small num" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr className="muted">
                            <th style={{ textAlign: "left", fontWeight: 500 }}>Month</th>
                            <th style={{ textAlign: "right", fontWeight: 500 }}>Income</th>
                            <th style={{ textAlign: "right", fontWeight: 500 }}>Expenses</th>
                            <th style={{ textAlign: "right", fontWeight: 500 }}>Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.history.map((h) => (
                            <tr key={h.month} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ padding: "6px 0" }}>{new Date(h.month + "-01T00:00:00Z").toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" })}</td>
                              <td style={{ textAlign: "right" }}>{money(h.income, true)}</td>
                              <td style={{ textAlign: "right" }}>{money(h.expenses, true)}</td>
                              <td style={{ textAlign: "right", color: h.income - h.expenses >= 0 ? "var(--good)" : "var(--bad)" }}>{money(h.income - h.expenses, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  </div>
                  <div className="col" style={{ gap: "var(--space)" }}>
                    <Card title="Accounts">
                      <div className="list">
                        {d.accounts.map((a) => (
                          <button key={a.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left", opacity: a.archived ? 0.5 : 1 }} onClick={() => setModal({ kind: "account", initial: a as unknown as Record<string, unknown> })}>
                            <span className="grow">
                              <span className="item-title">{a.name}</span>
                              <span className="meta">
                                <span>{label(ACCOUNT_KINDS, a.kind)}</span>
                                {!a.include_in_net_worth && <span>excluded from net worth</span>}
                              </span>
                            </span>
                            <span className="num strong" style={{ color: a.liability ? "var(--bad)" : undefined }}>
                              {a.liability ? "−" : ""}
                              {money(a.balance)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </Card>
                    <Card title="Budgets" actions={<Button size="sm" variant="ghost" onClick={() => setModal({ kind: "budget", initial: {} })}><Plus size={14} aria-hidden /> Budget</Button>}>
                      {d.budgets.length === 0 ? (
                        <p className="small muted">Set monthly limits for categories you want to watch.</p>
                      ) : (
                        <div className="col gap-12">
                          {d.budgets.map((b) => {
                            const r = b.monthly_limit ? b.spent / b.monthly_limit : 0;
                            return (
                              <button key={b.id} style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setModal({ kind: "budget", initial: b as unknown as Record<string, unknown> })}>
                                <div className="row between small">
                                  <span>{b.category}</span>
                                  <span className="num">
                                    {money(b.spent)} / {money(b.monthly_limit)} {r > 1 && <span className="badge bad">Over</span>}
                                  </span>
                                </div>
                                <div className="mt-4">
                                  <Progress value={Math.min(1, r)} tone={r > 1 ? "bad" : r > 0.85 ? "warn" : undefined} label={`${b.category} budget used`} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              )}
              {tab === "transactions" && (
                <Card>
                  {d.transactions.length === 0 ? (
                    <p className="small muted">No transactions this month.</p>
                  ) : (
                    <div className="list">
                      {d.transactions.map((t) => {
                        const acc = d.accounts.find((a) => a.id === t.account_id);
                        const to = d.accounts.find((a) => a.id === t.to_account_id);
                        return (
                          <button key={t.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left" }} onClick={() => setModal({ kind: "transaction", initial: t as unknown as Record<string, unknown> })}>
                            <span className="small muted" style={{ width: 70 }}>
                              {fmtDate(t.occurred_on, today)}
                            </span>
                            <span className="grow">
                              <span className="item-title">{t.note || t.category || (t.kind === "transfer" ? "Transfer" : t.kind)}</span>
                              <span className="meta">
                                <span>{t.kind === "transfer" ? `${acc?.name} → ${to?.name}` : acc?.name}</span>
                                {t.category && t.note && <span>{t.category}</span>}
                              </span>
                            </span>
                            <span className="num strong" style={{ color: t.kind === "income" ? "var(--good)" : undefined }}>
                              {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}
                              {money(t.amount)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>
              )}
              {tab === "subscriptions" && (
                <Card actions={<Button size="sm" onClick={() => setModal({ kind: "subscription", initial: {} })}><Plus size={14} aria-hidden /> Subscription</Button>} title="Recurring subscriptions">
                  {d.subscriptions.length === 0 ? (
                    <p className="small muted">List recurring payments — small ones add up.</p>
                  ) : (
                    <div className="list">
                      {d.subscriptions.map((s) => (
                        <button key={s.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left", opacity: s.active ? 1 : 0.5 }} onClick={() => setModal({ kind: "subscription", initial: s as unknown as Record<string, unknown> })}>
                          <span className="grow">
                            <span className="item-title">{s.name}</span>
                            <span className="meta">
                              <span>{label(BILLING_CYCLES, s.cycle)}</span>
                              {s.next_renewal && <span>Renews {fmtDate(s.next_renewal, today)}</span>}
                              {!s.active && <span>Cancelled</span>}
                            </span>
                          </span>
                          <span className="num">
                            {money(s.amount)} <span className="muted small">≈ {money(monthlyEquivalent(s.amount, s.cycle))}/mo</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              )}
              <p className="tiny muted">Projections are simple arithmetic from your own numbers — not financial advice. For investment, tax or debt decisions, consider a qualified adviser.</p>
            </div>
          )
        }
      </Async>
      {form && modal && <FormModal open onClose={() => setModal(null)} title={modal.initial.id ? `Edit ${form.t.toLowerCase()}` : `New ${form.t.toLowerCase()}`} resource={form.r} fields={form.f} initial={modal.initial} deleteConfirm={modal.kind === "account" ? { title: "Delete this account?", body: "All its transactions are deleted too. To keep history, archive it instead." } : undefined} />}
    </div>
  );
}
