import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { task_id, task_name, due_date, email } = req.body;
  if (!task_id || !task_name || !due_date || !email) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const { error } = await supabase
    .from("reminders")
    .upsert(
      { task_id, task_name, due_date, email, reminder_sent: false },
      { onConflict: "task_id" }
    );

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
