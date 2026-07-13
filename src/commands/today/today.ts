import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, User, MessageFlags } from "discord.js";
import { commands } from "../../registry";
import { createEmbed } from "../../utils/embedFactory";
import { getTodaysOpenTodos } from "../../services/todoService";
import { getTodaysReminderCount } from "../../services/reminderService";
import { getAverageInProgressProgress, getInProgressGoals } from "../../services/goalService";
import { getUserTimezone } from "../../services/reminderService";
import { DateTime } from "luxon";

commands.set("today", {
  data: new SlashCommandBuilder()
    .setName("today")
    .setDescription("Show today's overview: open todos, reminders, and goal progress"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await executeToday(interaction);
  },
});

async function executeToday(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const timezone = await getUserTimezone(userId);

  const [openTodos, reminderCount, avgProgress, inProgressGoals] = await Promise.all([
    getTodaysOpenTodos(userId, timezone),
    getTodaysReminderCount(userId, timezone),
    getAverageInProgressProgress(userId),
    getInProgressGoals(userId),
  ]);

  const embed = createTodayEmbed(interaction.user, timezone, openTodos, reminderCount, avgProgress, inProgressGoals);
  await interaction.editReply({ embeds: [embed] });
}

function createTodayEmbed(
  user: User,
  timezone: string,
  openTodos: Array<{ id: string; content: string; dueDate: Date | null }>,
  reminderCount: number,
  avgProgress: number,
  inProgressGoals: Array<{ id: string; title: string; progress: number }>
): EmbedBuilder {
  const now = DateTime.now().setZone(timezone);
  const dateStr = now.toFormat("cccc, MMM d, yyyy");

  const embed = createEmbed("today")
    .setTitle("📅 Today's Overview")
    .setDescription(dateStr)
    .setFooter({ text: `DevOS • ${user.username}` });

  if (openTodos.length > 0) {
    const todoLines = openTodos.slice(0, 5).map((t) => {
      const due = t.dueDate ? ` (due ${DateTime.fromJSDate(t.dueDate, { zone: "utc" }).setZone(timezone).toFormat("h:mm a")})` : "";
      return `• ${t.content}${due}`;
    });
    if (openTodos.length > 5) {
      todoLines.push(`... and ${openTodos.length - 5} more`);
    }
    embed.addFields({ name: "📝 Open Todos", value: todoLines.join("\n"), inline: false });
  } else {
    embed.addFields({ name: "📝 Open Todos", value: "No open todos for today ✨", inline: false });
  }

  embed.addFields({ name: "⏰ Reminders Today", value: reminderCount.toString(), inline: true });

  const progressLabel = inProgressGoals.length > 0 ? `Avg Progress (${inProgressGoals.length} active)` : "No active goals";
  const progressBar = buildProgressBar(avgProgress);
  embed.addFields({ name: `📈 ${progressLabel}`, value: `${progressBar} ${avgProgress}%`, inline: true });

  return embed;
}

function buildProgressBar(percent: number, length = 10): string {
  const filled = Math.round((percent / 100) * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}