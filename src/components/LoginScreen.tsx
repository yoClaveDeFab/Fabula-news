import { useState } from 'react';
import { Newspaper, ShieldAlert, Loader2 } from 'lucide-react';
import { loginWithGoogle, logoutUser } from '../services/firebase.js';

interface LoginScreenProps {
  allowedEmail: string;
  userEmail?: string | null;
  isUnauthorized?: boolean;
}

export function LoginScreen({ allowedEmail, userEmail, isUnauthorized }: LoginScreenProps) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoggingIn(true);
    setErrorMsg(null);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      console.error('Error de login:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Error al autenticar con Google.');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl space-y-6 text-center">
        {/* App Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center shadow-2xl shadow-rose-950/60 mx-auto text-white text-3xl font-black">
          F
        </div>

        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Fabula News</h1>
          <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
            Generador editorial de guiones tech para TikTok y HeyGen.
          </p>
        </div>

        {/* Unauthorized alert if authenticated email doesn't match ALLOWED_EMAIL */}
        {isUnauthorized && (
          <div className="p-4 rounded-2xl bg-red-950/50 border border-red-500/60 text-red-200 text-xs text-left space-y-2">
            <div className="flex items-center gap-2 font-bold text-red-400">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Acceso no autorizado</span>
            </div>
            <p className="leading-relaxed">
              Iniciaste sesión con <strong className="text-white">{userEmail}</strong>, pero esta aplicación está configurada exclusivamente para el usuario:
            </p>
            <div className="p-2 rounded bg-neutral-950 font-mono text-[11px] text-amber-300">
              {allowedEmail}
            </div>
            <button
              onClick={() => logoutUser()}
              className="w-full mt-2 py-1.5 px-3 rounded-lg bg-red-900/60 hover:bg-red-800 text-white font-semibold text-xs transition"
            >
              Cerrar sesión e intentar con otra cuenta
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs text-left">
            {errorMsg}
          </div>
        )}

        {!isUnauthorized && (
          <div className="space-y-4 pt-2">
            <p className="text-xs text-neutral-400">
              Acceso restringido. Inicia sesión con tu cuenta de Google autorizada.
            </p>

            <button
              onClick={handleLogin}
              disabled={loggingIn}
              className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-white hover:bg-neutral-100 text-neutral-950 flex items-center justify-center gap-3 transition shadow-lg active:scale-95 disabled:opacity-60"
            >
              {loggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-900" />
                  <span>Conectando con Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                    />
                  </svg>
                  <span>Iniciar sesión con Google</span>
                </>
              )}
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-neutral-800 text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
          <Newspaper className="w-3.5 h-3.5 text-neutral-600" />
          <span>Fabula News v1.0 • Formatos Rápido y Explicado</span>
        </div>
      </div>
    </div>
  );
}
