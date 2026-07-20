import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { commands } from "../../registry";
import { createEmbed } from "../../utils/embedFactory";
import { getTodoStats } from "../../services/todoService";
import { getGoalStats } from "../../services/goalService";
import { getStreak } from "../../services/streakService";
import { getSessionStats } from "../../services/focusService";
import { ensureUser } from "../../services/reminderService";

commands.set("stats", {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View your overall productivity stats and Productivity Score"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Ensure user exists in the database
    await ensureUser(userId, username);

    // Fetch stats from all relevant services in parallel
    const [todoStats, goalStats, streak, focusStats] = await Promise.all([
      getTodoStats(userId),
      getGoalStats(userId),
      getStreak(userId),
      getSessionStats(userId),
    ]);

    const totalTasks = todoStats.total;
    const completedTasks = todoStats.completed;
    const taskCompletionRate = todoStats.percent;

    const completedGoals = goalStats.completed;
    const currentStreak = streak.current;
    const bestStreak = streak.best;

    const focusMinutes = focusStats.totalMinutes;
    const focusHours = parseFloat((focusMinutes / 60).toFixed(1));
    const completedFocusSessions = focusStats.completed;

    /**
     * Productivity Score (0-100 scale) Formula:
     * - Task Completion Rate: 50% weight.
     *   If a user has no tasks yet, we default this component to 100% so they are not penalized.
     * - Focus Target: 30% weight.
     *   Based on completed focus hours relative to a weekly baseline target of 10 hours (capped at 100%).
     * - Active Streak: 20% weight.
     *   Based on current streak relative to a target of 10 days (capped at 100%).
     *
     * Productivity Score = (Task Completion Rate * 0.5) + (Focus Completion Rate * 0.3) + (Streak Rate * 0.2)
     */
    const taskScore = totalTasks === 0 ? 100 : taskCompletionRate;
    const focusTargetHours = 10;
    const focusScore = Math.min((focusHours / focusTargetHours) * 100, 100);
    const streakTargetDays = 10;
    const streakScore = Math.min((currentStreak / streakTargetDays) * 100, 100);

    const productivityScore = Math.round(
      taskScore * 0.5 +
      focusScore * 0.3 +
      streakScore * 0.2
    );

    // Build the stats dashboard embed
    const embed = createEmbed("stats")
      .setTitle("📈 Productivity Dashboard")
      .setDescription("An overview of your achievements and work focus in CultBot.")
      .addFields(
        {
          name: "📝 Tasks (Todos)",
          value: `Completed: **${completedTasks}** / ${totalTasks} (${taskCompletionRate}% rate)`,
          inline: true,
        },
        {
          name: "🎯 Goals",
          value: `Completed: **${completedGoals}** / ${goalStats.total}`,
          inline: true,
        },
        {
          name: "🔥 Streaks",
          value: `Current: **${currentStreak}** days\nBest: **${bestStreak}** days`,
          inline: true,
        },
        {
          name: "🍅 Focus Time",
          value: `Hours: **${focusHours}h** (${completedFocusSessions} session${completedFocusSessions === 1 ? "" : "s"} completed)`,
          inline: true,
        },
        {
          name: "⚡ Productivity Score",
          value: `Score: **${productivityScore}** / 100\n*Formula: 50% Todo Completion, 30% Focus Time (target 10h), 20% Streak (target 10d)*`,
          inline: false,
        }
      )
      .setFooter({ text: `CultBot • ${interaction.user.username}` });

    await interaction.editReply({ embeds: [embed] });
  },
});
