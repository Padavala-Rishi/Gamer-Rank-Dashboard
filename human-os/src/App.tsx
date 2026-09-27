import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, onUnauthorized, setSession } from "./lib/api";
import { useProfile } from "./lib/hooks";
import type { User } from "./lib/types";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider, Skeleton } from "./components/ui";
import { UIProvider } from "./layout/UIContext";
import { AppShell } from "./layout/AppShell";
import { AuthPage } from "./pages/Auth";

const Onboarding = lazy(() => import("./pages/Onboarding"));
const Today = lazy(() => import("./pages/Today"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Goals = lazy(() => import("./pages/Goals"));
const GoalDetail = lazy(() => import("./pages/GoalDetail"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Habits = lazy(() => import("./pages/Habits"));
const Focus = lazy(() => import("./pages/Focus"));
const Learning = lazy(() => import("./pages/Learning"));
const SubjectDetail = lazy(() => import("./pages/SubjectDetail"));
const FlashcardReview = lazy(() => import("./pages/FlashcardReview"));
const Career = lazy(() => import("./pages/Career"));
const Health = lazy(() => import("./pages/Health"));
const Finance = lazy(() => import("./pages/Finance"));
const People = lazy(() => import("./pages/People"));
const Journal = lazy(() => import("./pages/Journal"));
const Decisions = lazy(() => import("./pages/Decisions"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const Reviews = lazy(() => import("./pages/Reviews"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Compass = lazy(() => import("./pages/Compass"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

function useApplyAppearance() {
  const { data } = useProfile();
  useEffect(() => {
    const root = document.documentElement;
    if (!data) return;
    if (data.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", data.theme);
    root.setAttribute("data-density", data.density);
    if (data.reduced_motion === "reduce") root.setAttribute("data-motion", "reduce");
    else root.removeAttribute("data-motion");
    // Custom accent applies in light mode; dark mode keeps its contrast-checked accent.
    if (data.accent && data.accent.toLowerCase() !== "#2f6f5e") root.style.setProperty("--accent-custom", data.accent);
    else root.style.removeProperty("--accent-custom");
  }, [data]);
}

function Loading() {
  return (
    <div className="page">
      <Skeleton lines={6} height={18} />
    </div>
  );
}

function Authed() {
  useApplyAppearance();
  const profile = useProfile();
  if (profile.isLoading) return <Loading />;
  if (profile.data && !profile.data.onboarded) {
    return (
      <Suspense fallback={<Loading />}>
        <Onboarding />
      </Suspense>
    );
  }
  return (
    <UIProvider>
      <AppShell>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/goals/:id" element={<GoalDetail />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/habits" element={<Habits />} />
            <Route path="/focus" element={<Focus />} />
            <Route path="/learning" element={<Learning />} />
            <Route path="/learning/review" element={<FlashcardReview />} />
            <Route path="/learning/:id" element={<SubjectDetail />} />
            <Route path="/career" element={<Career />} />
            <Route path="/health" element={<Health />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/people" element={<People />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/journal/decisions" element={<Decisions />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/knowledge/:id" element={<Knowledge />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/compass" element={<Compass />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppShell>
    </UIProvider>
  );
}

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => get<{ user: User | null }>("/auth/me"), staleTime: Infinity, retry: 1 });
  useEffect(
    () =>
      onUnauthorized(() => {
        setSession(qc, null);
      }),
    [qc],
  );
  let content;
  if (me.isLoading) content = <Loading />;
  else if (me.error)
    content = (
      <div className="auth-wrap">
        <div className="card card-pad auth-card col gap-12" role="alert">
          <h2>Can't reach Human OS</h2>
          <p className="muted">The server didn't respond. Check your connection and try again.</p>
          <button className="btn btn-primary" onClick={() => me.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  else if (!me.data?.user) content = <AuthPage />;
  else content = <Authed />;
  return (
    <ToastProvider>
      <ConfirmProvider>{content}</ConfirmProvider>
    </ToastProvider>
  );
}
