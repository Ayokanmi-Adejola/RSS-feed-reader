import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="landing-shell" id="main-content">
      <section className="hero-panel" aria-labelledby="hero-title">
        <p className="eyebrow">Frontpage</p>
        <h1 id="hero-title">A reading dashboard that feels calm when your feeds are not.</h1>
        <p className="hero-copy">
          Pull RSS and Atom sources into one place. Sort by category, catch up with a digest,
          bookmark what matters, and read without the clutter.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/auth/sign-up">Create account</Link>
          <Link className="btn btn-secondary" href="/auth/sign-in">Sign in</Link>
        </div>
        <ul className="hero-highlights" aria-label="Frontpage benefits">
          <li>Secure personal feed workspace with synced preferences</li>
          <li>Server-side feed refresh with retries and cache validation</li>
          <li>Power-user keyboard navigation and virtualized reading list</li>
        </ul>
      </section>
    </main>
  );
}
