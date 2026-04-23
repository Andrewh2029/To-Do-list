import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });

  const { task_id } = req.body;
  if (!task_id) return res.status(400).json({ error: "Missing task_id" });

  const { error } = await supabase
    .from("reminders")
    .delete()
    .eq("task_id", task_id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
