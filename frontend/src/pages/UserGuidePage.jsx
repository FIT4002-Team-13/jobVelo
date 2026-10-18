import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  Mic,
  MessageCircleQuestion,
  CirclePlay,
  CircleCheck,
  MessageSquareText,
  Search,
  ListChecks,
  FileCheck,
  ChartColumnStacked,
  UserPen,
  UserRoundPlus,
  FileChartColumn,
  ShieldCheck,
  UserCircle2,
  Users,
} from "lucide-react";
import Sidebar from "../components/common/Sidebar";
import { useAuth } from "../lib/AuthContext.jsx";
import { card, page } from "../styles/layout";
import content from "../content/userGuide.json";

const ICONS = {
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  CirclePlay,
  UserRoundPlus,
  FileChartColumn,
  Mic,
  MessageCircleQuestion,
  CircleCheck,
  MessageSquareText,
  Search,
  ListChecks,
  FileCheck,
  ChartColumnStacked,
  UserPen,
  ShieldCheck,
  UserCircle2,
  Users,
};

const TABS = [
  { key: "guides", label: "Step-by-step Guides" },
  { key: "troubleshooting", label: "Troubleshooting" },
  { key: "limitations", label: "Limitations & Support" },
];

function visibleTo(item, role) {
  return !item.roles || item.roles.includes(role);
}

function buildSections(role) {
  const roleName = content.roleNames[role] || "Account";
  return content.sections
    .map((section) => ({
      ...section,
      icon: ICONS[section.icon] || BookOpen,
      tasks: section.tasks
        .filter((task) => visibleTo(task, role))
        .map((task) => ({
          ...task,
          title: task.title.replace("{role}", roleName),
          icon: ICONS[task.icon] || BookOpen,
          steps: task.steps
            .filter((step) => visibleTo(step, role))
            .map((step) => step.text),
        })),
    }))
    .filter((section) => section.tasks.length > 0);
}

function buildTroubleshooting(role) {
  return content.troubleshooting.filter((item) => visibleTo(item, role));
}

function RolePill({ label }) {
  if (!label) return null;
  return (
    <span className="rounded-pill bg-primary-100 px-2.5 py-0.5 text-[11px] font-semibold text-primary-600">
      {label}
    </span>
  );
}

function StepNumber({ n }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-primary-100 text-xs font-bold text-primary-600">
      {n}
    </span>
  );
}

function TaskCard({ task, open, onToggle }) {
  const Icon = task.icon;
  return (
    <div
      className={`rounded-xl border transition-colors ${
        open
          ? "border-primary-200 bg-primary-500/5"
          : "border-neutral-200 bg-neutral-0"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Icon size={18} className="shrink-0 text-neutral-500" aria-hidden="true" />
          <h3 className="text-sm font-bold text-neutral-800">{task.title}</h3>
          <RolePill label={task.role} />
        </div>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-primary-100 px-5 pb-4 pt-4">
          {task.intro && (
            <p className="mb-3 text-xs italic text-neutral-500">{task.intro}</p>
          )}
          <ol className="flex flex-col gap-2.5">
            {task.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <StepNumber n={i + 1} />
                <span className="pt-0.5 text-sm text-neutral-700">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function SectionDropdown({ section, open, onToggle, openTaskKey, onToggleTask }) {
  const Icon = section.icon;
  return (
    <div className={`${card.flat} overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Icon size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-neutral-800">{section.title}</h2>
            <p className="mt-0.5 text-xs text-neutral-500">{section.summary}</p>
          </div>
        </div>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-neutral-100 px-6 pb-5 pt-4">
          {section.tasks.map((task) => (
            <TaskCard
              key={task.key}
              task={task}
              open={openTaskKey === task.key}
              onToggle={() => onToggleTask(task.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TroubleshootingList({ items }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-0 p-4">
          <h3 className="text-sm font-bold text-neutral-800">{item.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

function LimitationsPanel({ items }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-0 p-4">
            <h3 className="text-sm font-bold text-neutral-800">{item.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">{item.text}</p>
          </div>
        ))}
      </div>

    </div>
  );
}

export default function UserGuidePage() {
  const { user } = useAuth();
  const role = user?.role || "";
  const sections = useMemo(() => buildSections(role), [role]);
  const troubles = useMemo(() => buildTroubleshooting(role), [role]);

  const [activeTab, setActiveTab] = useState("guides");
  const [openSections, setOpenSections] = useState(() => new Set());
  const [openTaskKey, setOpenTaskKey] = useState(null);

  const toggleSection = (key) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Clicking the open task collapses it; clicking another swaps to it.
  const toggleTask = (key) => setOpenTaskKey((prev) => (prev === key ? null : key));

  return (
    <div className={page.shell}>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-neutral-200 bg-neutral-0 px-10 py-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
            User Guide
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Learn how to use JobVelo.
          </p>
        </header>

        <main className="flex-1 overflow-y-auto px-10 py-8">
          <div className="mx-auto flex max-w-6xl flex-col">
            <div className={`${card.flat} overflow-hidden`}>
              <div
                role="tablist"
                aria-label="User guide sections"
                className="flex items-center gap-6 border-b border-neutral-200 px-6 pt-4"
              >
                {TABS.map((t) => {
                  const isActive = t.key === activeTab;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(t.key)}
                      className={`relative pb-3 text-sm font-semibold transition-colors ${
                        isActive
                          ? "text-primary-600"
                          : "text-neutral-500 hover:text-neutral-700"
                      }`}
                    >
                      {t.label}
                      {isActive && (
                        <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-pill bg-primary-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="p-6">
                {activeTab === "guides" && (
                  <>
                    <h2 className="mb-4 text-sm font-bold text-neutral-800">
                      Choose a topic
                    </h2>
                    <div className="flex flex-col gap-3">
                      {sections.map((section) => (
                        <SectionDropdown
                          key={section.key}
                          section={section}
                          open={openSections.has(section.key)}
                          onToggle={() => toggleSection(section.key)}
                          openTaskKey={openTaskKey}
                          onToggleTask={toggleTask}
                        />
                      ))}
                    </div>

                    <div className="mt-6 flex items-center gap-2 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
                      <span>Need more help?</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab("troubleshooting")}
                        className="font-semibold text-primary-600 hover:text-primary-700"
                      >
                        View troubleshooting
                      </button>
                    </div>
                  </>
                )}

                {activeTab === "troubleshooting" && <TroubleshootingList items={troubles} />}

                {activeTab === "limitations" && <LimitationsPanel items={content.limitations} />}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
