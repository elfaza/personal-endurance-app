"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="error-state">
      <h2>Let’s take a breath.</h2>
      <p>This screen couldn’t load. Try again to reconnect to your training.</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
