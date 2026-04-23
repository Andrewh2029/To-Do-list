import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const now = new Date();

  // Fetch all unsent reminders that are still in the future
  const { data: allReminders, error: fetchError } = await supabase
    .from("reminders")
    .select("*")
    .eq("reminder_sent", false)
    .gt("due_date", now.toISOString());

  // Filter to only those whose reminder window has arrived based on their offset
  const reminders = (allReminders || []).filter(r => {
    const dueDate = new Date(r.due_date);
    const offsetMs = (r.reminder_offset_hours || 24) * 60 * 60 * 1000;
    return now >= new Date(dueDate.getTime() - offsetMs);
  });

  if (fetchError) return res.status(500).json({ error: fetchError.message });

  let sent = 0;
  for (const reminder of reminders) {
    const dueDate = new Date(reminder.due_date);
    const formattedDate = dueDate.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: reminder.email,
      subject: `Reminder: "${reminder.task_name}" is due in 24 hours`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9f9f9; border-radius: 8px;">
          <h2 style="color: #333; margin-top: 0;">Task Reminder</h2>
          <p style="font-size: 16px; color: #555;">Your task is due soon:</p>
          <div style="background: white; border-left: 4px solid #e67e22; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
            <strong style="font-size: 18px; color: #222;">${reminder.task_name}</strong>
            <p style="margin: 8px 0 0; color: #777; font-size: 14px;">Due: ${formattedDate}</p>
          </div>
          <p style="font-size: 13px; color: #aaa; margin-top: 24px;">Sent by your To-Do App reminder service.</p>
        </div>
      `,
    });

    if (!emailError) {
      await supabase
        .from("reminders")
        .update({ reminder_sent: true })
        .eq("id", reminder.id);
      sent++;
    }
  }

  // Clean up past-due reminders (already sent or overdue)
  await supabase
    .from("reminders")
    .delete()
    .lt("due_date", now.toISOString());

  return res.status(200).json({ sent, total: reminders.length });
}
