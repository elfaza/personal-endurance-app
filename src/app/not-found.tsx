import Link from "next/link";
export default function NotFound() {
  return (
    <main className="login-page">
      <div className="panel login-card">
        <span className="eyebrow">A LITTLE OFF COURSE</span>
        <h1>
          Let’s find
          <br />
          your way back.
        </h1>
        <p>This page isn’t on your training plan.</p>
        <Link className="btn btn-primary" href="/dashboard">
          Back to your dashboard
        </Link>
      </div>
    </main>
  );
}
