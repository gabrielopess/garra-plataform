"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

const STORAGE_KEY = "garra_all_weeks_data";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DayTasks {
  planned: number;
  completed: number;
}

interface WeekTasks {
  domingo: DayTasks;
  segunda: DayTasks;
  terca: DayTasks;
  quarta: DayTasks;
  quinta: DayTasks;
  sexta: DayTasks;
  sabado: DayTasks;
}

interface FocusTime {
  domingo: number;
  segunda: number;
  terca: number;
  quarta: number;
  quinta: number;
  sexta: number;
  sabado: number;
}

interface Distractions {
  redesSociais: number;
  youtube: number;
  jogos: number;
  streaming: number;
  mensagens: number;
  navegacao: number;
}

const DISTRACTION_LABELS: Record<keyof Distractions, string> = {
  redesSociais: "Redes Sociais",
  youtube: "YouTube",
  jogos: "Jogos",
  streaming: "Streaming",
  mensagens: "Mensagens",
  navegacao: "Navegação",
};

interface WeekData {
  tasks: WeekTasks;
  focus: FocusTime;
  distractions: Distractions;
}

interface AllWeeksData {
  [weekKey: string]: WeekData;
}

const initialWeekTasks: WeekTasks = {
  domingo: { planned: 0, completed: 0 },
  segunda: { planned: 0, completed: 0 },
  terca: { planned: 0, completed: 0 },
  quarta: { planned: 0, completed: 0 },
  quinta: { planned: 0, completed: 0 },
  sexta: { planned: 0, completed: 0 },
  sabado: { planned: 0, completed: 0 },
};

const initialFocusTime: FocusTime = {
  domingo: 0,
  segunda: 0,
  terca: 0,
  quarta: 0,
  quinta: 0,
  sexta: 0,
  sabado: 0,
};

const initialDistractions: Distractions = {
  redesSociais: 0,
  youtube: 0,
  jogos: 0,
  streaming: 0,
  mensagens: 0,
  navegacao: 0,
};

// Get the Monday of the week for a given date
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Format date as YYYY-MM-DD for use as key
function formatWeekKey(date: Date): string {
  const weekStart = getWeekStart(date);
  return weekStart.toISOString().split("T")[0];
}

// Format date range for display (e.g., "13 - 19 Jan 2025")
function formatWeekRange(date: Date): string {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const startDay = weekStart.getDate();
  const endDay = weekEnd.getDate();
  const startMonth = months[weekStart.getMonth()];
  const endMonth = months[weekEnd.getMonth()];
  const year = weekEnd.getFullYear();

  if (startMonth === endMonth) {
    return `${startDay} - ${endDay} ${startMonth} ${year}`;
  }
  return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
}

// Calculate dynamic scale for charts
function calculateDynamicScale(maxValue: number, minScale: number = 4): { max: number; levels: number[] } {
  // If no data or very small, use minimum scale
  if (maxValue <= 0) {
    const step = minScale / 4;
    return {
      max: minScale,
      levels: [0, step, step * 2, step * 3, minScale]
    };
  }

  // Add ~50% buffer above max value, rounded to nice number
  const buffer = maxValue * 0.5;
  const rawMax = maxValue + buffer;

  // Round to nice intervals (1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 18, 20, 24, etc.)
  const niceNumbers = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40, 48];
  let max = niceNumbers.find(n => n >= rawMax) || Math.ceil(rawMax / 4) * 4;

  // Ensure minimum scale
  max = Math.max(max, minScale);

  // Calculate levels (5 levels including 0 and max)
  const step = max / 4;
  const levels = [0, step, step * 2, step * 3, max];

  return { max, levels };
}

export default function Home() {
  const [allWeeksData, setAllWeeksData] = useState<AllWeeksData>({});
  const [currentWeekDate, setCurrentWeekDate] = useState<Date>(new Date());
  const [isLoaded, setIsLoaded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentWeekKey = formatWeekKey(currentWeekDate);

  // Get current week data or initialize with defaults
  const getCurrentWeekData = (): WeekData => {
    const data = allWeeksData[currentWeekKey];
    if (!data) {
      return {
        tasks: { ...initialWeekTasks },
        focus: { ...initialFocusTime },
        distractions: { ...initialDistractions },
      };
    }
    // Ensure all fields exist (for backwards compatibility with old data)
    return {
      tasks: data.tasks || { ...initialWeekTasks },
      focus: data.focus || { ...initialFocusTime },
      distractions: data.distractions || { ...initialDistractions },
    };
  };

  const currentWeekData = getCurrentWeekData();
  const weekTasks = currentWeekData.tasks;
  const focusTime = currentWeekData.focus;
  const distractions = currentWeekData.distractions || initialDistractions;

  // Calculate dynamic scales
  const maxFocusTime = Math.max(...Object.values(focusTime));
  const focusScale = calculateDynamicScale(maxFocusTime, 4);

  const maxDistraction = Math.max(...Object.values(distractions));
  const distractionScale = calculateDynamicScale(maxDistraction, 4);

  // Update tasks for current week
  const setWeekTasks = (newTasks: WeekTasks | ((prev: WeekTasks) => WeekTasks)) => {
    setAllWeeksData((prev) => {
      const currentData = prev[currentWeekKey] || { tasks: { ...initialWeekTasks }, focus: { ...initialFocusTime }, distractions: { ...initialDistractions } };
      const updatedTasks = typeof newTasks === "function" ? newTasks(currentData.tasks) : newTasks;
      return {
        ...prev,
        [currentWeekKey]: {
          ...currentData,
          tasks: updatedTasks,
        },
      };
    });
  };

  // Update focus time for current week
  const setFocusTime = (newFocus: FocusTime | ((prev: FocusTime) => FocusTime)) => {
    setAllWeeksData((prev) => {
      const currentData = prev[currentWeekKey] || { tasks: { ...initialWeekTasks }, focus: { ...initialFocusTime }, distractions: { ...initialDistractions } };
      const updatedFocus = typeof newFocus === "function" ? newFocus(currentData.focus) : newFocus;
      return {
        ...prev,
        [currentWeekKey]: {
          ...currentData,
          focus: updatedFocus,
        },
      };
    });
  };

  // Update distractions for current week
  const setDistractions = (newDistractions: Distractions | ((prev: Distractions) => Distractions)) => {
    setAllWeeksData((prev) => {
      const currentData = prev[currentWeekKey] || { tasks: { ...initialWeekTasks }, focus: { ...initialFocusTime }, distractions: { ...initialDistractions } };
      const updatedDistractions = typeof newDistractions === "function" ? newDistractions(currentData.distractions || initialDistractions) : newDistractions;
      return {
        ...prev,
        [currentWeekKey]: {
          ...currentData,
          distractions: updatedDistractions,
        },
      };
    });
  };

  // Navigation functions
  const goToPreviousWeek = () => {
    setCurrentWeekDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 7);
      return newDate;
    });
  };

  const goToNextWeek = () => {
    setCurrentWeekDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 7);
      return newDate;
    });
  };

  const goToCurrentWeek = () => {
    setCurrentWeekDate(new Date());
  };

  const isCurrentWeek = formatWeekKey(new Date()) === currentWeekKey;

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        setAllWeeksData(parsed);
      } catch {
        setAllWeeksData({});
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allWeeksData));
    }
  }, [allWeeksData, isLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getEffectiveness = (day: keyof WeekTasks): number => {
    const { planned, completed } = weekTasks[day];
    if (planned === 0) return 0;
    return Math.round((completed / planned) * 100);
  };

  const dayKeys: (keyof WeekTasks)[] = [
    "domingo",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
  ];

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, weekTasks, focusTime, distractions }),
      });

      const data = await response.json();

      if (data.weekTasksChanged) {
        setWeekTasks(data.weekTasksChanged);
      }

      if (data.focusTimeChanged) {
        setFocusTime(data.focusTimeChanged);
      }

      if (data.distractionsChanged) {
        setDistractions(data.distractionsChanged);
      }

      if (data.message) {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "100vh",
        backgroundColor: "#fafafa",
        padding: "40px 20px",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Week Navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <button
          onClick={goToPreviousWeek}
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid #e0e0e0",
            backgroundColor: "#fff",
            color: "#666",
            fontSize: "14px",
            cursor: "pointer",
            transition: "all 0.2s",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#1a1a1a";
            e.currentTarget.style.color = "#1a1a1a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#e0e0e0";
            e.currentTarget.style.color = "#666";
          }}
        >
          ← Anterior
        </button>

        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: "600",
              color: "#1a1a1a",
            }}
          >
            {formatWeekRange(currentWeekDate)}
          </div>
          {!isCurrentWeek && (
            <button
              onClick={goToCurrentWeek}
              style={{
                marginTop: "4px",
                padding: "2px 8px",
                borderRadius: "4px",
                border: "none",
                backgroundColor: "#f0f0f0",
                color: "#666",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Ir para semana atual
            </button>
          )}
        </div>

        <button
          onClick={goToNextWeek}
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid #e0e0e0",
            backgroundColor: "#fff",
            color: "#666",
            fontSize: "14px",
            cursor: "pointer",
            transition: "all 0.2s",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#1a1a1a";
            e.currentTarget.style.color = "#1a1a1a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#e0e0e0";
            e.currentTarget.style.color = "#666";
          }}
        >
          Próxima →
        </button>
      </div>

      {/* Header */}
      <h1
        style={{
          fontSize: "14px",
          fontWeight: "500",
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: "32px",
        }}
      >
        Efetividade Semanal
      </h1>

      {/* Chart Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: "480px",
          marginBottom: "48px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            width: "100%",
            height: "220px",
            padding: "0 8px",
            gap: "12px",
          }}
        >
          {dayKeys.map((day) => {
            const effectiveness = getEffectiveness(day);
            const barColor = effectiveness >= 80 ? "#22c55e" : effectiveness >= 50 ? "#eab308" : effectiveness > 0 ? "#ef4444" : "#e0e0e0";

            return (
              <div
                key={day}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flex: 1,
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: effectiveness > 0 ? "#1a1a1a" : "#ccc",
                  }}
                >
                  {effectiveness}%
                </span>
                <div
                  style={{
                    width: "100%",
                    maxWidth: "36px",
                    height: `${Math.max((effectiveness / 100) * 160, 4)}px`,
                    backgroundColor: barColor,
                    borderRadius: "6px 6px 0 0",
                    transition: "height 0.4s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s",
                  }}
                />
                <div
                  style={{
                    fontSize: "10px",
                    color: "#aaa",
                    marginTop: "-4px",
                  }}
                >
                  {weekTasks[day].completed}/{weekTasks[day].planned}
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis line */}
        <div
          style={{
            width: "100%",
            height: "1px",
            backgroundColor: "#e0e0e0",
            marginBottom: "12px",
          }}
        />

        {/* Day labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            padding: "0 8px",
            gap: "12px",
          }}
        >
          {DAYS.map((day) => (
            <span
              key={day}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: "11px",
                fontWeight: "500",
                color: "#888",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {day}
            </span>
          ))}
        </div>
      </div>

      {/* Focus Time Section */}
      <h2
        style={{
          fontSize: "14px",
          fontWeight: "500",
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: "24px",
        }}
      >
        Tempo de Foco
      </h2>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: "480px",
          marginBottom: "48px",
        }}
      >
        {/* Line Chart */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "200px",
            padding: "0 8px",
          }}
        >
          {/* Y-axis labels */}
          <div
            style={{
              position: "absolute",
              left: "-28px",
              top: 0,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              fontSize: "10px",
              color: "#aaa",
            }}
          >
            {[...focusScale.levels].reverse().map((level) => (
              <span key={level}>{level}h</span>
            ))}
          </div>

          {/* Grid lines */}
          <div
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            {focusScale.levels.map((level) => (
              <div
                key={level}
                style={{
                  width: "100%",
                  height: "1px",
                  backgroundColor: "#e8e8e8",
                }}
              />
            ))}
          </div>

          {/* SVG Line Chart */}
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 480 200"
            preserveAspectRatio="none"
            style={{ position: "absolute", top: 0, left: 0 }}
          >
            {/* Line path */}
            <polyline
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={dayKeys
                .map((day, index) => {
                  const x = 40 + index * ((480 - 80) / 6);
                  const y = 200 - (focusTime[day] / focusScale.max) * 200;
                  return `${x},${y}`;
                })
                .join(" ")}
            />
            {/* Data points */}
            {dayKeys.map((day, index) => {
              const x = 40 + index * ((480 - 80) / 6);
              const y = 200 - (focusTime[day] / focusScale.max) * 200;
              return (
                <circle
                  key={day}
                  cx={x}
                  cy={y}
                  r="5"
                  fill="#3b82f6"
                  stroke="#fff"
                  strokeWidth="2"
                />
              );
            })}
          </svg>

          {/* Editable values */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              justifyContent: "space-between",
              padding: "0 20px",
            }}
          >
            {dayKeys.map((day) => {
              const yPos = 200 - (focusTime[day] / focusScale.max) * 200;
              return (
                <div
                  key={day}
                  style={{
                    position: "relative",
                    flex: 1,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <input
                    type="number"
                    min="0"
                    max={focusScale.max}
                    step="0.5"
                    value={focusTime[day]}
                    onChange={(e) => {
                      const value = Math.max(0, parseFloat(e.target.value) || 0);
                      setFocusTime((prev) => ({ ...prev, [day]: value }));
                    }}
                    style={{
                      position: "absolute",
                      top: `${Math.max(0, Math.min(170, yPos - 30))}px`,
                      width: "36px",
                      padding: "2px 4px",
                      fontSize: "11px",
                      fontWeight: "600",
                      textAlign: "center",
                      border: "1px solid transparent",
                      borderRadius: "4px",
                      backgroundColor: "transparent",
                      color: "#3b82f6",
                      outline: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    onFocus={(e) => {
                      e.target.style.backgroundColor = "#fff";
                      e.target.style.borderColor = "#3b82f6";
                    }}
                    onBlur={(e) => {
                      e.target.style.backgroundColor = "transparent";
                      e.target.style.borderColor = "transparent";
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* X-axis line */}
        <div
          style={{
            width: "100%",
            height: "1px",
            backgroundColor: "#e0e0e0",
            marginBottom: "12px",
          }}
        />

        {/* Day labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            padding: "0 8px",
            gap: "12px",
          }}
        >
          {DAYS.map((day) => (
            <span
              key={day}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: "11px",
                fontWeight: "500",
                color: "#888",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {day}
            </span>
          ))}
        </div>
      </div>

      {/* Distractions Section */}
      <h2
        style={{
          fontSize: "14px",
          fontWeight: "500",
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: "24px",
        }}
      >
        Distrações da Semana
      </h2>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: "480px",
          marginBottom: "48px",
        }}
      >
        {/* Radar Chart */}
        <div
          style={{
            position: "relative",
            width: "320px",
            height: "320px",
          }}
        >
          <svg
            width="320"
            height="320"
            viewBox="0 0 320 320"
            style={{ position: "absolute", top: 0, left: 0 }}
          >
            {/* Grid circles */}
            {[1, 2, 3, 4].map((level) => {
              const radius = (level / 4) * 120;
              return (
                <g key={level}>
                  <circle
                    cx="160"
                    cy="160"
                    r={radius}
                    fill="none"
                    stroke="#e8e8e8"
                    strokeWidth="1"
                  />
                  {/* Scale label at top of each circle */}
                  <text
                    x="160"
                    y={160 - radius - 2}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#bbb"
                  >
                    {distractionScale.levels[level]}h
                  </text>
                </g>
              );
            })}

            {/* Axis lines */}
            {Object.keys(distractions).map((_, index) => {
              const angle = (index * 60 - 90) * (Math.PI / 180);
              const x2 = 160 + 120 * Math.cos(angle);
              const y2 = 160 + 120 * Math.sin(angle);
              return (
                <line
                  key={index}
                  x1="160"
                  y1="160"
                  x2={x2}
                  y2={y2}
                  stroke="#e8e8e8"
                  strokeWidth="1"
                />
              );
            })}

            {/* Data polygon */}
            <polygon
              points={Object.values(distractions)
                .map((value, index) => {
                  const angle = (index * 60 - 90) * (Math.PI / 180);
                  const normalizedValue = Math.min(value, distractionScale.max) / distractionScale.max;
                  const radius = normalizedValue * 120;
                  const x = 160 + radius * Math.cos(angle);
                  const y = 160 + radius * Math.sin(angle);
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="rgba(239, 68, 68, 0.2)"
              stroke="#ef4444"
              strokeWidth="2"
            />

            {/* Data points */}
            {Object.values(distractions).map((value, index) => {
              const angle = (index * 60 - 90) * (Math.PI / 180);
              const normalizedValue = Math.min(value, distractionScale.max) / distractionScale.max;
              const radius = normalizedValue * 120;
              const x = 160 + radius * Math.cos(angle);
              const y = 160 + radius * Math.sin(angle);
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="4"
                  fill="#ef4444"
                  stroke="#fff"
                  strokeWidth="2"
                />
              );
            })}
          </svg>

          {/* Labels with inputs */}
          {(Object.keys(distractions) as (keyof Distractions)[]).map((key, index) => {
            const angle = (index * 60 - 90) * (Math.PI / 180);
            const labelRadius = 145;
            const x = 160 + labelRadius * Math.cos(angle);
            const y = 160 + labelRadius * Math.sin(angle);

            // Adjust text alignment based on position
            let textAlign: "left" | "center" | "right" = "center";
            let translateX = "-50%";
            if (index === 0) {
              textAlign = "center";
              translateX = "-50%";
            } else if (index === 1 || index === 2) {
              textAlign = "left";
              translateX = "0%";
            } else if (index === 4 || index === 5) {
              textAlign = "right";
              translateX = "-100%";
            } else if (index === 3) {
              textAlign = "center";
              translateX = "-50%";
            }

            return (
              <div
                key={key}
                style={{
                  position: "absolute",
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: `translate(${translateX}, -50%)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: textAlign === "center" ? "center" : textAlign === "left" ? "flex-start" : "flex-end",
                  gap: "2px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "500",
                    color: "#666",
                    whiteSpace: "nowrap",
                  }}
                >
                  {DISTRACTION_LABELS[key]}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={distractions[key]}
                  onChange={(e) => {
                    const value = Math.max(0, parseFloat(e.target.value) || 0);
                    setDistractions((prev) => ({ ...prev, [key]: value }));
                  }}
                  style={{
                    width: "44px",
                    padding: "2px 4px",
                    fontSize: "11px",
                    fontWeight: "600",
                    textAlign: "center",
                    border: "1px solid #e0e0e0",
                    borderRadius: "4px",
                    backgroundColor: "#fff",
                    color: "#ef4444",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#ef4444";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e0e0e0";
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div
          style={{
            marginTop: "16px",
            fontSize: "11px",
            color: "#888",
          }}
        >
          Horas por semana (escala: 0-{distractionScale.max}h)
        </div>
      </div>

      {/* Chat Section */}
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        {/* Messages */}
        <div
          style={{
            flex: 1,
            minHeight: "200px",
            maxHeight: "320px",
            overflowY: "auto",
            marginBottom: "16px",
            padding: "4px",
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                textAlign: "center",
                color: "#bbb",
                fontSize: "13px",
                paddingTop: "40px",
                lineHeight: "1.6",
              }}
            >
              Conte quantas tarefas você planejou e completou em cada dia.
              <br />
              Ex: &quot;Segunda eu planejei 5 tarefas e fiz 4&quot;
            </div>
          )}
          {messages.map((msg, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: "12px",
              }}
            >
              <div
                className={msg.role === "assistant" ? "markdown-content" : ""}
                style={{
                  padding: "12px 16px",
                  borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                  backgroundColor: msg.role === "user" ? "#1a1a1a" : "#fff",
                  color: msg.role === "user" ? "#fff" : "#1a1a1a",
                  maxWidth: "85%",
                  fontSize: "14px",
                  lineHeight: "1.5",
                  boxShadow: msg.role === "assistant" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {msg.role === "assistant" ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "20px 20px 20px 4px",
                  backgroundColor: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      backgroundColor: "#ccc",
                      animation: "pulse 1.4s ease-in-out infinite",
                    }}
                  />
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      backgroundColor: "#ccc",
                      animation: "pulse 1.4s ease-in-out 0.2s infinite",
                    }}
                  />
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      backgroundColor: "#ccc",
                      animation: "pulse 1.4s ease-in-out 0.4s infinite",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            style={{
              flex: 1,
              padding: "14px 18px",
              borderRadius: "28px",
              border: "1px solid #e0e0e0",
              fontSize: "14px",
              outline: "none",
              backgroundColor: "#fff",
              transition: "border-color 0.2s, box-shadow 0.2s",
              fontFamily: "inherit",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#1a1a1a";
              e.target.style.boxShadow = "0 0 0 3px rgba(26,26,26,0.08)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e0e0e0";
              e.target.style.boxShadow = "none";
            }}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            style={{
              padding: "14px 24px",
              borderRadius: "28px",
              border: "none",
              backgroundColor: "#1a1a1a",
              color: "#fff",
              fontSize: "14px",
              fontWeight: "500",
              cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
              opacity: isLoading || !input.trim() ? 0.4 : 1,
              transition: "opacity 0.2s, transform 0.2s",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => {
              if (!isLoading && input.trim()) {
                e.currentTarget.style.transform = "scale(1.02)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Enviar
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 80%, 100% {
            opacity: 0.4;
            transform: scale(0.8);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .markdown-content p {
          margin: 0 0 8px 0;
        }
        .markdown-content p:last-child {
          margin-bottom: 0;
        }
        .markdown-content strong {
          font-weight: 600;
        }
        .markdown-content em {
          font-style: italic;
        }
        .markdown-content ul, .markdown-content ol {
          margin: 8px 0;
          padding-left: 20px;
        }
        .markdown-content li {
          margin: 4px 0;
        }
        .markdown-content code {
          background-color: rgba(0, 0, 0, 0.06);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 13px;
        }
        .markdown-content pre {
          background-color: #1a1a1a;
          color: #fff;
          padding: 12px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 8px 0;
        }
        .markdown-content pre code {
          background: none;
          padding: 0;
          color: inherit;
        }
        .markdown-content blockquote {
          border-left: 3px solid #e0e0e0;
          margin: 8px 0;
          padding-left: 12px;
          color: #666;
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
          margin: 12px 0 8px 0;
          font-weight: 600;
        }
        .markdown-content h1 { font-size: 18px; }
        .markdown-content h2 { font-size: 16px; }
        .markdown-content h3 { font-size: 15px; }
        .markdown-content a {
          color: #007bff;
          text-decoration: none;
        }
        .markdown-content a:hover {
          text-decoration: underline;
        }
        .markdown-content hr {
          border: none;
          border-top: 1px solid #e0e0e0;
          margin: 12px 0;
        }
      `}</style>
    </main>
  );
}
