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
      "Adiciona ou subtrai horas de distração a uma categoria específica. Use quando o usuário informar que gastou tempo em uma distração (ex: 'gastei 3 horas em redes sociais'). Use valores negativos para subtrair (ex: 'remover 2h de jogos'). O valor será SOMADO ao total da semana naquela categoria.",
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
          description: "Quantidade de horas a adicionar (positivo) ou subtrair (negativo). O resultado final nunca será menor que 0.",
        },
      },
      required: ["category", "hours"],
    },
  },
  {
    name: "set_distraction",
    description:
      "Define o valor exato de horas de distração para uma categoria específica. Use quando o usuário quiser CORRIGIR ou DEFINIR um valor específico (ex: 'redes sociais foi 5 horas', 'zerar jogos', 'colocar youtube em 3h'). Diferente de add_distraction que soma, esta ferramenta SUBSTITUI o valor.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: ["redesSociais", "youtube", "jogos", "streaming", "mensagens", "navegacao"],
          description: "A categoria de distração",
        },
        hours: {
          type: "number",
          description: "Valor exato de horas para definir na categoria (mínimo 0)",
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
  {
    name: "navigate_week",
    description:
      "Navega para uma semana diferente para visualizar ou editar dados. Use quando o usuário mencionar 'semana passada', 'semana anterior', 'próxima semana', 'voltar uma semana', ou 'semana atual'. Os dados da semana navegada serão carregados automaticamente.",
    input_schema: {
      type: "object" as const,
      properties: {
        direction: {
          type: "string",
          enum: ["previous", "next", "current"],
          description: "Direção da navegação: 'previous' (semana passada), 'next' (próxima semana), 'current' (voltar para semana atual)",
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "reset_all_tasks",
    description:
      "Zera TODAS as tarefas da semana atual (todos os 7 dias). Use quando o usuário quiser limpar/resetar/zerar todas as tarefas da semana.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "reset_all_focus",
    description:
      "Zera TODO o tempo de foco da semana atual (todos os 7 dias). Use quando o usuário quiser limpar/resetar/zerar todo o tempo de foco da semana.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "reset_all_distractions",
    description:
      "Zera TODAS as distrações da semana atual (todas as 6 categorias). Use quando o usuário quiser limpar/resetar/zerar todas as distrações da semana.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "reset_entire_week",
    description:
      "Zera TODOS os dados da semana atual: tarefas, tempo de foco E distrações. Use quando o usuário quiser limpar/resetar/zerar TUDO da semana, começar do zero, ou limpar todos os gráficos.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_sample_data",
    description:
      "Gera dados de exemplo/genéricos/fictícios para a semana atual. Use quando o usuário pedir para adicionar dados de teste, exemplo, genéricos, fictícios, ou para popular os gráficos com dados. Gera tarefas, tempo de foco e distrações realistas.",
    input_schema: {
      type: "object" as const,
      properties: {
        style: {
          type: "string",
          enum: ["produtivo", "mediano", "improdutivo", "aleatorio"],
          description: "Estilo dos dados: 'produtivo' (alta efetividade, muito foco, poucas distrações), 'mediano' (valores médios), 'improdutivo' (baixa efetividade, pouco foco, muitas distrações), 'aleatorio' (valores variados)",
        },
      },
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
): { result: string; weekTasksChanged?: WeekTasks; focusTimeChanged?: FocusTime; distractionsChanged?: Distractions; navigateWeek?: "previous" | "next" | "current" } {
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
    const hours = toolInput.hours as number;

    distractions[category] = Math.max(0, distractions[category] + hours);

    const action = hours >= 0 ? `+${hours}h adicionadas` : `${hours}h removidas`;

    return {
      result: `${distractionNames[category]}: ${action} (total: ${distractions[category]}h na semana)`,
      distractionsChanged: JSON.parse(JSON.stringify(distractions)),
    };
  } else if (toolName === "set_distraction") {
    const category = toolInput.category as DistractionKey;
    const hours = Math.max(0, toolInput.hours as number);

    distractions[category] = hours;

    return {
      result: `${distractionNames[category]}: definido para ${hours}h na semana`,
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
  } else if (toolName === "navigate_week") {
    const direction = toolInput.direction as "previous" | "next" | "current";

    const directionNames = {
      previous: "semana anterior",
      next: "próxima semana",
      current: "semana atual",
    };

    return {
      result: `Navegando para ${directionNames[direction]}. Os dados serão carregados automaticamente.`,
      navigateWeek: direction,
    };
  } else if (toolName === "reset_all_tasks") {
    // Reset all tasks to zero
    const dayKeysArr: DayKey[] = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
    dayKeysArr.forEach(day => {
      weekTasks[day] = { planned: 0, completed: 0 };
    });

    return {
      result: "Todas as tarefas da semana foram zeradas (7 dias).",
      weekTasksChanged: JSON.parse(JSON.stringify(weekTasks)),
    };
  } else if (toolName === "reset_all_focus") {
    // Reset all focus time to zero
    const dayKeysArr: DayKey[] = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
    dayKeysArr.forEach(day => {
      focusTime[day] = 0;
    });

    return {
      result: "Todo o tempo de foco da semana foi zerado (7 dias).",
      focusTimeChanged: JSON.parse(JSON.stringify(focusTime)),
    };
  } else if (toolName === "reset_all_distractions") {
    // Reset all distractions to zero
    const categoryKeys: DistractionKey[] = ["redesSociais", "youtube", "jogos", "streaming", "mensagens", "navegacao"];
    categoryKeys.forEach(cat => {
      distractions[cat] = 0;
    });

    return {
      result: "Todas as distrações da semana foram zeradas (6 categorias).",
      distractionsChanged: JSON.parse(JSON.stringify(distractions)),
    };
  } else if (toolName === "reset_entire_week") {
    // Reset everything
    const dayKeysArr: DayKey[] = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
    dayKeysArr.forEach(day => {
      weekTasks[day] = { planned: 0, completed: 0 };
      focusTime[day] = 0;
    });

    const categoryKeys: DistractionKey[] = ["redesSociais", "youtube", "jogos", "streaming", "mensagens", "navegacao"];
    categoryKeys.forEach(cat => {
      distractions[cat] = 0;
    });

    return {
      result: "TODOS os dados da semana foram zerados: tarefas (7 dias), tempo de foco (7 dias) e distrações (6 categorias).",
      weekTasksChanged: JSON.parse(JSON.stringify(weekTasks)),
      focusTimeChanged: JSON.parse(JSON.stringify(focusTime)),
      distractionsChanged: JSON.parse(JSON.stringify(distractions)),
    };
  } else if (toolName === "generate_sample_data") {
    const style = (toolInput.style as string) || "aleatorio";
    const dayKeysArr: DayKey[] = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
    const categoryKeys: DistractionKey[] = ["redesSociais", "youtube", "jogos", "streaming", "mensagens", "navegacao"];

    // Helper to generate random number in range
    const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randFloat = (min: number, max: number) => Math.round((Math.random() * (max - min) + min) * 2) / 2;

    if (style === "produtivo") {
      // High productivity: 80-100% effectiveness, 6-10h focus, low distractions
      dayKeysArr.forEach(day => {
        const planned = rand(6, 10);
        const completed = rand(Math.floor(planned * 0.8), planned);
        weekTasks[day] = { planned, completed };
        focusTime[day] = randFloat(6, 10);
      });
      categoryKeys.forEach(cat => {
        distractions[cat] = randFloat(0, 2);
      });
    } else if (style === "improdutivo") {
      // Low productivity: 20-50% effectiveness, 1-4h focus, high distractions
      dayKeysArr.forEach(day => {
        const planned = rand(5, 8);
        const completed = rand(1, Math.floor(planned * 0.5));
        weekTasks[day] = { planned, completed };
        focusTime[day] = randFloat(1, 4);
      });
      categoryKeys.forEach(cat => {
        distractions[cat] = randFloat(3, 8);
      });
    } else if (style === "mediano") {
      // Medium productivity: 50-80% effectiveness, 4-7h focus, medium distractions
      dayKeysArr.forEach(day => {
        const planned = rand(5, 8);
        const completed = rand(Math.floor(planned * 0.5), Math.floor(planned * 0.8));
        weekTasks[day] = { planned, completed };
        focusTime[day] = randFloat(4, 7);
      });
      categoryKeys.forEach(cat => {
        distractions[cat] = randFloat(1, 4);
      });
    } else {
      // Random/varied
      dayKeysArr.forEach(day => {
        const planned = rand(3, 10);
        const completed = rand(0, planned);
        weekTasks[day] = { planned, completed };
        focusTime[day] = randFloat(0, 10);
      });
      categoryKeys.forEach(cat => {
        distractions[cat] = randFloat(0, 6);
      });
    }

    const styleNames: Record<string, string> = {
      produtivo: "produtivo (alta efetividade)",
      improdutivo: "improdutivo (baixa efetividade)",
      mediano: "mediano (efetividade média)",
      aleatorio: "aleatório (valores variados)",
    };

    return {
      result: `Dados de exemplo gerados no estilo ${styleNames[style]}. Tarefas, tempo de foco e distrações foram preenchidos para os 7 dias.`,
      weekTasksChanged: JSON.parse(JSON.stringify(weekTasks)),
      focusTimeChanged: JSON.parse(JSON.stringify(focusTime)),
      distractionsChanged: JSON.parse(JSON.stringify(distractions)),
    };
  }

  return { result: "Ferramenta não encontrada" };
}

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      weekTasks: clientWeekTasks,
      focusTime: clientFocusTime,
      distractions: clientDistractions,
      currentDate,
      currentWeekRange,
      isCurrentWeek,
    } = await request.json();

    if (clientWeekTasks) {
      weekTasks = clientWeekTasks;
    }

    if (clientFocusTime) {
      focusTime = clientFocusTime;
    }

    if (clientDistractions) {
      distractions = clientDistractions;
    }

    // Parse current date info
    const now = currentDate ? new Date(currentDate) : new Date();
    const dayOfWeek = now.getDay();
    const dayKeyMap: DayKey[] = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
    const todayKey = dayKeyMap[dayOfWeek];
    const todayName = dayNames[todayKey];

    // Calculate yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDayOfWeek = yesterday.getDay();
    const yesterdayKey = dayKeyMap[yesterdayDayOfWeek];
    const yesterdayName = dayNames[yesterdayKey];

    const dateStr = now.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });

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

    const weekContext = isCurrentWeek
      ? `Você está visualizando a **semana atual** (${currentWeekRange}).`
      : `Você está visualizando uma **semana passada ou futura** (${currentWeekRange}). Use navigate_week("current") para voltar à semana atual.`;

    const systemPrompt = `Você é um assistente que ajuda o usuário a rastrear sua produtividade diária através de três métricas:
1. **Efetividade de Tarefas**: tarefas planejadas vs completadas
2. **Tempo de Foco**: horas dedicadas ao trabalho focado por dia (0-24h)
3. **Distrações**: horas gastas em distrações durante a semana (acumulativo)

## Contexto de Data e Hora
- **Data atual**: ${dateStr}
- **Hoje**: ${todayName} (${todayKey})
- **Ontem**: ${yesterdayName} (${yesterdayKey})
- ${weekContext}

## Dados da semana visualizada (${currentWeekRange || "semana atual"})

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
1. **Adicionar tempo**: use add_distraction com valor positivo (ex: "gastei 3h em jogos")
2. **Subtrair tempo**: use add_distraction com valor negativo (ex: "remover 2h de jogos" → add_distraction(jogos, -2))
3. **Definir/Corrigir valor**: use set_distraction para SUBSTITUIR o valor (ex: "redes sociais foi 5h", "zerar youtube")
4. Se mencionar múltiplas distrações, chame a ferramenta apropriada para CADA uma
5. Quando perguntar sobre distrações, use get_distractions

### Quando usar cada ferramenta de distrações:
- **add_distraction**: quando o usuário está ADICIONANDO tempo gasto hoje ("gastei 3h", "perdi 2h")
- **set_distraction**: quando o usuário quer CORRIGIR ou DEFINIR um valor específico ("foi 5h", "na verdade eram 3h", "zerar", "colocar em 0")

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
- "Redes sociais foi 5 horas no total" → set_distraction(redesSociais, 5)
- "Zerar jogos" → set_distraction(jogos, 0)
- "Remover 2h de youtube" → add_distraction(youtube, -2)
- "Quero corrigir: streaming era 4h, não 6h" → set_distraction(streaming, 4)

### Para Navegação entre Semanas:
1. Quando o usuário mencionar "semana passada", "semana anterior", use navigate_week("previous")
2. Quando mencionar "próxima semana", use navigate_week("next")
3. Quando mencionar "voltar para hoje", "semana atual", use navigate_week("current")
4. Após navegar, informe o usuário que os dados da nova semana foram carregados

### Interpretação de Datas:
- "Hoje" = ${todayName} (use ${todayKey})
- "Ontem" = ${yesterdayName} (use ${yesterdayKey})
- Se o usuário disser "hoje gastei 3h em jogos", use add_distraction com a categoria apropriada
- Se o usuário disser "ontem foquei 5 horas", use set_focus_time com o dia de ontem (${yesterdayKey})
- IMPORTANTE: Se ontem foi em outra semana (ex: hoje é domingo e ontem foi sábado da semana passada), primeiro navegue para a semana anterior com navigate_week("previous"), depois registre os dados

### Para Limpeza/Reset de Dados:
1. **reset_all_tasks**: Zera todas as tarefas da semana (7 dias)
2. **reset_all_focus**: Zera todo o tempo de foco da semana (7 dias)
3. **reset_all_distractions**: Zera todas as distrações da semana (6 categorias)
4. **reset_entire_week**: Zera TUDO da semana (tarefas + foco + distrações)

### Exemplos de limpeza:
- "Limpar tudo dessa semana" → reset_entire_week
- "Zerar todas as tarefas" → reset_all_tasks
- "Limpar tempo de foco" → reset_all_focus
- "Resetar distrações" → reset_all_distractions
- "Limpar os 3 gráficos da semana passada" → navigate_week("previous") DEPOIS reset_entire_week

### Para Gerar Dados de Exemplo:
- **generate_sample_data**: Gera dados fictícios/de teste para a semana atual
- Estilos disponíveis: "produtivo", "mediano", "improdutivo", "aleatorio"

### Exemplos de geração de dados:
- "Adicionar dados de exemplo" → generate_sample_data()
- "Popular com dados de teste" → generate_sample_data()
- "Colocar dados genéricos" → generate_sample_data()
- "Dados produtivos" → generate_sample_data("produtivo")
- "Simular semana ruim" → generate_sample_data("improdutivo")

### Cores do gráfico de efetividade:
- Verde: >= 80%
- Amarelo: >= 50%
- Vermelho: < 50%

## IMPORTANTE: Comandos Complexos

Você DEVE ser capaz de executar comandos complexos quebrando-os em múltiplas ações. Exemplos:

1. **"Limpar todos os dados da semana passada"**:
   - Primeiro: navigate_week("previous")
   - Depois: reset_entire_week

2. **"Zerar tudo e registrar: segunda 5/6, terça 4/5"**:
   - Primeiro: reset_entire_week
   - Depois: set_day_tasks para segunda
   - Depois: set_day_tasks para terça

3. **"Na semana passada, segunda foquei 6h e terça 5h"**:
   - Primeiro: navigate_week("previous")
   - Depois: set_focus_time(segunda, 6)
   - Depois: set_focus_time(terca, 5)

4. **"Limpar distrações e tempo de foco"**:
   - reset_all_distractions
   - reset_all_focus

5. **"Adicionar dados genéricos para semana passada e atual"**:
   - Primeiro: generate_sample_data() para semana atual
   - Depois: navigate_week("previous")
   - Depois: generate_sample_data() para semana passada
   - Depois: navigate_week("current") para voltar

6. **"Popular as duas últimas semanas com dados de teste"**:
   - generate_sample_data() na atual
   - navigate_week("previous")
   - generate_sample_data() na anterior
   - navigate_week("current")

SEMPRE execute TODAS as ações necessárias para completar o pedido do usuário. Não pergunte se ele quer continuar - execute tudo de uma vez. Se o usuário pedir para fazer algo em múltiplas semanas, navegue entre elas e execute as ações em cada uma.

Responda sempre em português de forma concisa e amigável. Após registrar os dados, mostre um resumo do que foi atualizado. Quando navegar entre semanas, confirme para qual semana você navegou.`;

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
    let navigateWeek: "previous" | "next" | "current" | undefined;

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

        if (toolResult.navigateWeek) {
          navigateWeek = toolResult.navigateWeek;
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
      navigateWeek: navigateWeek,
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Erro ao processar mensagem" },
      { status: 500 }
    );
  }
}
