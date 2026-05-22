// Vercel Cron Job — ejecuta semanalmente para evitar que el proyecto Supabase
// entre en pausa por inactividad (free tier pausa tras 7 días sin requests).
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return res.status(500).json({ error: 'Supabase env vars not configured' });
  }

  try {
    const response = await fetch(`${url}/rest/v1/songs?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Supabase responded ${response.status}` });
    }

    return res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
