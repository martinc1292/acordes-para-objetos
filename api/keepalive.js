// Vercel Cron Job — ejecuta semanalmente para evitar que el proyecto Supabase
// entre en pausa por inactividad (free tier pausa tras 7 días sin requests).
export default async function handler(req, res) {
  // When CRON_SECRET is set (Vercel injects it as a Bearer token on cron calls),
  // reject anyone who doesn't present it. Without the env var the endpoint stays open.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
