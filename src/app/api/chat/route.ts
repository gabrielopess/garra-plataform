import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

type DistractionKey = keyof Distractions;

const distractionNames: Record<DistractionKey, string> = {
  redesSociais: "Redes Sociais",
  youtube: "YouTube",
  jogos: "Jogos",
  streaming: "Streaming",
  mensagens: "Mensagens",
  navegacao: "Navegação",
};

type DayKey = keyof WeekTasks;

let weekTasks: WeekTasks = {
  domingo: { planned: 0, completed: 0 },
  segunda: { planned: 0, completed: 0 },
  terca: { planned: 0, completed: 0 },
  quarta: { planned: 0, completed: 0 },
  quinta: { planned: 0, completed: 0 },
  sexta: { planned: 0, completed: 0 },
  sabado: { planned: 0, completed: 0 },
};

let focusTime: FocusTime = {
  domingo: 0,
  segunda: 0,
  terca: 0,
  quarta: 0,
  quinta: 0,
  sexta: 0,
  sabado: 0,
};

let distractions: Distractions = {
  redesSociais: 0,
  youtube: 0,
  jogos: 0,
  streaming: 0,
  mensagens: 0,
  navegacao: 0,
};

const dayNames: Record<DayKey, string> = {
  domingo: "Domingo",
  segunda: "Segunda-feira",
  terca: "Terça-feira",
  quarta: "Quarta-feira",
  quinta: "Quinta-feira",
  sexta: "Sexta-feira",
  sabado: "Sábado",
};

const tools: Anthropic.Tool[] = [
  {
    name: "set_day_tasks",
    description:
      "Define as tarefas planejadas e/ou completadas de um dia específico. Use quando o usuário informar quantas tarefas planejou e/ou completou em um dia. Pode definir apenas planned, apenas completed, ou ambos.",
    input_schema: {
      type: "object" as const,
      properties: {
        day: {
          type: "string",
          enum: ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"],
          description: "O dia da semana",
        },
        planned: {
          type: "number",
          description: "Quantidade de tarefas planejadas para o dia (opcional)",
        },
        completed: {
          type: "number",
          description: "Quantidade de tarefas completadas no dia (opcional)",
        },
      },
      required: ["day"],
    },
  },
  {
    name: "get_week_tasks",
    description:
      "Obtém os dados de tarefas de todos os dias da semana, incluindo planejadas, completadas e porcentagem de efetividade.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_day_tasks",
    description:
      "Obtém os dados de tarefas de um dia específico.",
    input_schema: {
      type: "object" as const,
      properties: {
        day: {
          type: "string",
          enum: ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"],
          description: "O dia da semana",
        },
      },
      required: ["day"],
    },
  },
  {
    name: "set_focus_time",
    description:
      "Define o tempo de foco (em horas) de um dia específico. Use quando o usuário informar quantas horas focou em um dia. O valor deve estar entre 0 e 24 horas.",
    input_schema: {
      type: "object" as const,
      properties: {
        day: {
          type: "string",
          enum: ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"],
          description: "O dia da semana",
        },
        hours: {
          type: "number",
          description: "Quantidade de horas de foco (0 a 24)",
        },
      },
      required: ["day", "hours"],
    },
  },
  {
    name: "get_focus_time",
    description:
      "Obtém os dados de tempo de foco de todos os dias da semana ou de um dia específico.",
    input_schema: {
      type: "object" as const,
      properties: {
        day: {
          type: "string",
          enum: ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"],
          description: "O dia da semana (opcional - se não informado, retorna todos os dias)",
        },
      },
      required: [],
    },
  },
  {
    name: "add_distraction",
    description:
      "Adiciona horas de distração a uma categoria específica. Use quando o usuário informar que gastou tempo em uma distração (ex: 'gastei 3 horas em redes sociais', 'perdi 2h no YouTube'). O valor será SOMADO ao total da semana naquela categoria.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: ["redesSociais", "youtube", "jogos", "streaming", "mensagens", "navegacao"],
          description: "A categoria de distração: redesSociais (redes sociais, Instagram, Twitter, TikTok, Facebook), youtube, jogos (games, videogame), streaming (Netflix, filmes, séries), mensagens (WhatsApp, Telegram, chat), navegacao (navegação aleatória na internet, sites diversos)",
        },
        hours: {
          type: "number",
          description: "Quantidade de horas a adicionar (será somado ao total existente)",
        },
      },
      required: ["category", "hours"],
    },
  },
  {
    name: "get_distractions",
    description:
      "Obtém os dados de distrações da semana, mostrando quantas horas foram gastas em cada categoria.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

function getEffectiveness(day: DayKey): number {
  const { planned, completed } = weekTasks[day];
  if (planned === 0) return 0;
  return Math.round((completed / planned) * 100);
}

function processToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): { result: string; weekTasksChanged?: WeekTasks; focusTimeChanged?: FocusTime; distractionsChanged?: Distractions } {
  if (toolName === "set_day_tasks") {
    const day = toolInput.day as DayKey;
    const planned = toolInput.planned as number | undefined;
    const completed = toolInput.completed as number | undefined;

    if (planned !== undefined) {
      weekTasks[day].planned = Math.max(0, planned);
    }
    if (completed !== undefined) {
      weekTasks[day].completed = Math.max(0, completed);
    }

    const effectiveness = getEffectiveness(day);
    const { planned: p, completed: c } = weekTasks[day];

    return {
      result: `${dayNames[day]}: ${c} tarefas completadas de ${p} planejadas (${effectiveness}% de efetividade)`,
      weekTasksChanged: JSON.parse(JSON.stringify(weekTasks)),
    };
  } else if (toolName === "get_week_tasks") {
    const summary = Object.entries(weekTasks)
      .map(([day, data]) => {
        const eff = getEffectiveness(day as DayKey);
        return `${dayNames[day as DayKey]}: ${data.completed}/${data.planned} (${eff}%)`;
      })
      .join("\n");

    return {
      result: `Resumo da semana:\n${summary}`,
    };
  } else if (toolName === "get_day_tasks") {
    const day = toolInput.day as DayKey;
    const { planned, completed } = weekTasks[day];
    const effectiveness = getEffectiveness(day);

    return {
      result: `${dayNames[day]}: ${completed} completadas de ${planned} planejadas (${effectiveness}% de efetividade)`,
    };
  } else if (toolName === "set_focus_time") {
    const day = toolInput.day as DayKey;
    const hours = Math.min(24, Math.max(0, toolInput.hours as number));

    focusTime[day] = hours;

    return {
      result: `${dayNames[day]}: ${hours}h de tempo de foco registrado`,
      focusTimeChanged: JSON.parse(JSON.stringify(focusTime)),
    };
  } else if (toolName === "get_focus_time") {
    const day = toolInput.day as DayKey | undefined;

    if (day) {
      return {
        result: `${dayNames[day]}: ${focusTime[day]}h de foco`,
      };
    }

    const summary = Object.entries(focusTime)
      .map(([d, hours]) => `${dayNames[d as DayKey]}: ${hours}h`)
      .join("\n");

    return {
      result: `Tempo de foco da semana:\n${summary}`,
    };
  } else if (toolName === "add_distraction") {
    const category = toolInput.category as DistractionKey;
    const hours = Math.max(0, toolInput.hours as number);

    distractions[category] += hours;

    return {
      result: `${distractionNames[category]}: +${hours}h adicionadas (total: ${distractions[category]}h na semana)`,
      distractionsChanged: JSON.parse(JSON.stringify(distractions)),
    };
  } else if (toolName === "get_distractions") {
    const summary = Object.entries(distractions)
      .map(([key, hours]) => `${distractionNames[key as DistractionKey]}: ${hours}h`)
      .join("\n");

    const total = Object.values(distractions).reduce((sum, h) => sum + h, 0);

    return {
      result: `Distrações da semana:\n${summary}\n\nTotal: ${total}h`,
    };
  }

  return { result: "Ferramenta não encontrada" };
}

export async function POST(request: NextRequest) {
  try {
    const { messages, weekTasks: clientWeekTasks, focusTime: clientFocusTime, distractions: clientDistractions } = await request.json();

    if (clientWeekTasks) {
      weekTasks = clientWeekTasks;
    }

    if (clientFocusTime) {
      focusTime = clientFocusTime;
    }

    if (clientDistractions) {
      distractions = clientDistractions;
    }

    const weekSummary = Object.entries(weekTasks)
      .map(([day, data]) => {
        const eff = getEffectiveness(day as DayKey);
        return `- ${dayNames[day as DayKey]}: ${data.completed}/${data.planned} tarefas (${eff}%)`;
      })
      .join("\n");

    const focusSummary = Object.entries(focusTime)
      .map(([day, hours]) => `- ${dayNames[day as DayKey]}: ${hours}h`)
      .join("\n");

    const distractionsSummary = Object.entries(distractions)
      .map(([key, hours]) => `- ${distractionNames[key as DistractionKey]}: ${hours}h`)
      .join("\n");

    const totalDistractions = Object.values(distractions).reduce((sum, h) => sum + h, 0);

    const systemPrompt = `Você é um assistente que ajuda o usuário a rastrear sua produtividade diária através de três métricas:
1. **Efetividade de Tarefas**: tarefas planejadas vs completadas
2. **Tempo de Foco**: horas dedicadas ao trabalho focado por dia (0-24h)
3. **Distrações**: horas gastas em distrações durante a semana (acumulativo)

## Dados atuais da semana

### Tarefas:
${weekSummary}

### Tempo de Foco:
${focusSummary}

### Distrações (total da semana: ${totalDistractions}h):
${distractionsSummary}

## Suas responsabilidades:

### Para Tarefas:
1. Quando o usuário informar tarefas de um ou MAIS dias, use set_day_tasks para CADA dia mencionado
2. IMPORTANTE: Se o usuário mencionar múltiplos dias em uma única mensagem (ex: "Segunda fiz 3 de 5, terça fiz 4 de 6"), você DEVE chamar set_day_tasks separadamente para CADA dia
3. Quando perguntar sobre os dados, use get_week_tasks ou get_day_tasks
4. Se o usuário só mencionar um valor (ex: "fiz 5 tarefas segunda"), pergunte quantas foram planejadas

### Para Tempo de Foco:
1. Quando o usuário informar tempo de foco (ex: "foquei 6 horas segunda", "segunda: 4h de foco"), use set_focus_time
2. Se mencionar múltiplos dias, chame set_focus_time para CADA dia
3. Quando perguntar sobre tempo de foco, use get_focus_time

### Para Distrações:
1. Quando o usuário informar tempo gasto em distrações, use add_distraction
2. O valor será SOMADO ao total existente da categoria (acumulativo na semana)
3. Se mencionar múltiplas distrações, chame add_distraction para CADA uma
4. Quando perguntar sobre distrações, use get_distractions

### Categorias de distrações:
- **redesSociais**: Redes sociais (Instagram, Twitter/X, TikTok, Facebook, LinkedIn)
- **youtube**: YouTube (vídeos, shorts)
- **jogos**: Jogos (videogame, games mobile, PC)
- **streaming**: Streaming (Netflix, filmes, séries, Disney+, HBO)
- **mensagens**: Mensagens (WhatsApp, Telegram, Discord, chat)
- **navegacao**: Navegação aleatória (sites diversos, notícias, fóruns)

### Exemplos de distrações:
- "Gastei 3 horas em redes sociais" → add_distraction(redesSociais, 3)
- "Hoje perdi 2h no YouTube e 1h em jogos" → duas chamadas de add_distraction
- "Fiquei 4h no Instagram" → add_distraction(redesSociais, 4)
- "Vi séries por 3 horas" → add_distraction(streaming, 3)

### Cores do gráfico de efetividade:
- Verde: >= 80%
- Amarelo: >= 50%
- Vermelho: < 50%

Responda sempre em português de forma concisa e amigável. Após registrar os dados, mostre um resumo do que foi atualizado.`;

    let response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      tools: tools,
      messages: messages,
    });

    let weekTasksChanged: WeekTasks | undefined;
    let focusTimeChanged: FocusTime | undefined;
    let distractionsChanged: Distractions | undefined;

    while (response.stop_reason === "tool_use") {
      // Find ALL tool_use blocks in the response (for multiple tool calls)
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) break;

      // Process all tool calls and collect results
      const toolResults = toolUseBlocks.map((toolUseBlock) => {
        if (toolUseBlock.type !== "tool_use") {
          return { tool_use_id: "", result: "" };
        }

        const toolResult = processToolCall(
          toolUseBlock.name,
          toolUseBlock.input as Record<string, unknown>
        );

        if (toolResult.weekTasksChanged) {
          weekTasksChanged = toolResult.weekTasksChanged;
        }

        if (toolResult.focusTimeChanged) {
          focusTimeChanged = toolResult.focusTimeChanged;
        }

        if (toolResult.distractionsChanged) {
          distractionsChanged = toolResult.distractionsChanged;
        }

        return {
          tool_use_id: toolUseBlock.id,
          result: toolResult.result,
        };
      });

      const updatedMessages = [
        ...messages,
        { role: "assistant" as const, content: response.content },
        {
          role: "user" as const,
          content: toolResults.map((tr) => ({
            type: "tool_result" as const,
            tool_use_id: tr.tool_use_id,
            content: tr.result,
          })),
        },
      ];

      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools,
        messages: updatedMessages,
      });
    }

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

    return NextResponse.json({
      message: text,
      weekTasksChanged: weekTasksChanged,
      focusTimeChanged: focusTimeChanged,
      distractionsChanged: distractionsChanged,
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Erro ao processar mensagem" },
      { status: 500 }
    );
  }
}
