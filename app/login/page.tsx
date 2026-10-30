export const metadata = { title: "Entra · Abita" };

const ERRORI: Record<string, string> = { "1": "Password sbagliata. Riprova.", config: "Manca ABITA_PASSWORD nelle variabili d'ambiente: aggiungila e riavvia." };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const q = await searchParams, errore = ERRORI[String(q.errore ?? "")], dopo = String(q.dopo ?? "");
  return (
    <main className="accesso">
      <form method="post" action="/api/accesso">
        <h1>Abita</h1>
        <p className="tenue" style={{ margin: 0 }}>Il tuo studio. Entra con la password.</p>
        <input type="password" name="password" autoComplete="current-password" aria-label="Password" placeholder="Password" required autoFocus />
        <input type="hidden" name="dopo" value={dopo} />
        {errore && <p className="errore-testo" role="alert" style={{ margin: 0 }}>{errore}</p>}
        <button className="btn primario" type="submit">Entra</button>
      </form>
    </main>
  );
}
