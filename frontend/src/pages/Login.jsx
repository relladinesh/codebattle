import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginApi, googleCallbackApi } from "../api/authApi";
import { useAuth } from "../store/auth";

export default function Login() {
  const nav = useNavigate();
  const { saveAuth } = useAuth();

  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ refs to avoid StrictMode double initialization
  const gsiLoadedRef = useRef(false);
  const gsiInitedRef = useRef(false);
  const hiddenGoogleBtnRef = useRef(null);

  const onChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await loginApi(form);

      // backend returns { token, user } (no ok)
      if (!res?.token) {
        setErr(res?.message || "Login failed");
        return;
      }

      saveAuth(res); // your store should put token in localStorage
      nav("/dashboard");
    } catch (e2) {
      setErr(e2?.message || "Login error");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Load Google Identity script in THIS PAGE ONLY
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setErr("Missing VITE_GOOGLE_CLIENT_ID in .env");
      return;
    }

    // already available
    if (window.google?.accounts?.id) {
      initGsi(clientId);
      return;
    }

    // prevent duplicate script
    const existing = document.querySelector('script[data-gsi="true"]');
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.gsi = "true";

    script.onload = () => {
      gsiLoadedRef.current = true;
      initGsi(clientId);
    };

    script.onerror = () => setErr("Failed to load Google login script");

    document.body.appendChild(script);
  }, []);

  function initGsi(clientId) {
    if (gsiInitedRef.current) return;
    if (!window.google?.accounts?.id) return;

    gsiInitedRef.current = true;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        try {
          setErr("");
          setLoading(true);

          const idToken = response?.credential;
          if (!idToken) {
            setErr("Google did not return token");
            return;
          }

          // ✅ call your backend
          const res = await googleCallbackApi(idToken);

          if (!res?.token) {
            setErr(res?.message || "Google login failed");
            return;
          }

          saveAuth(res);
          nav("/dashboard");
        } catch (e) {
          setErr(e?.message || "Google login error");
        } finally {
          setLoading(false);
        }
      },
    });

    // ✅ Render a REAL Google button (but we keep it hidden)
    // We'll trigger it using our custom button.
    if (hiddenGoogleBtnRef.current) {
      window.google.accounts.id.renderButton(hiddenGoogleBtnRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: 320,
      });
    }
  }

  // ✅ Custom button click triggers the hidden real Google button
  function onGoogleClick() {
    setErr("");

    // if not ready yet
    if (!window.google?.accounts?.id) {
      setErr("Google login is not ready yet. Refresh once.");
      return;
    }

    const realBtn = hiddenGoogleBtnRef.current?.querySelector("div[role=button]");
    if (!realBtn) {
      setErr("Google button not mounted. Refresh once.");
      return;
    }

    realBtn.click();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-bold">Login</h1>

        {err && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
            {err}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <input
            className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 outline-none focus:border-purple-500"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={onChange}
            autoComplete="email"
          />

          <input
            className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 outline-none focus:border-purple-500"
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={onChange}
            autoComplete="current-password"
          />

          <button
            disabled={loading}
            className="w-full p-3 rounded-xl bg-purple-700 hover:bg-purple-600 font-semibold disabled:opacity-60"
          >
            {loading ? "Please wait..." : "Login"}
          </button>
        </form>

        <div className="my-6 text-center text-slate-400 text-sm">OR</div>

        {/* ✅ YOUR CUSTOM GOOGLE BUTTON (you can redesign later) */}
        <button
          type="button"
          onClick={onGoogleClick}
          disabled={loading}
          className="w-full p-3 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 disabled:opacity-60 flex items-center justify-center gap-3"
        >
          <img
            src="https://developers.google.com/identity/images/g-logo.png"
            alt="google"
            className="w-5 h-5"
          />
          Login with Google
        </button>

        {/* ✅ Hidden real Google button (required for token + popup flow) */}
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          <div ref={hiddenGoogleBtnRef} />
        </div>

        <p className="mt-5 text-sm text-slate-300 text-center">
          New here?{" "}
          <Link className="text-blue-400 underline" to="/register">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}