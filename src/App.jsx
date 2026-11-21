import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "sonner";
import Lobby from "./components/Lobby.jsx";
import Room from "./components/Room.jsx";
import { applyTheme, getRoomFromUrl, getTheme, rememberRoom, setRoomInUrl } from "./lib/identity.js";

// the admin page loads only when you open /admin
const Admin = lazy(() => import("./components/Admin.jsx"));
const isAdmin = () => location.pathname.replace(/\/+$/, "") === "/admin";

export default function App() {
  const [room, setRoom] = useState(getRoomFromUrl);
  const [theme, setTheme] = useState(getTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  if (isAdmin()) {
    return <Suspense fallback={null}><Admin /></Suspense>;
  }

  const open = (code, label) => {
    rememberRoom(code, label ? { label } : {});
    setRoomInUrl(code);
    setRoom(code);
  };
  const leave = () => { setRoomInUrl(null); setRoom(null); };

  return (
    <>
      {room
        ? <Room key={room} code={room} onLeave={leave} onSwitch={open} theme={theme} setTheme={setTheme} />
        : <Lobby onOpen={open} />}
      <Toaster position="top-center" richColors closeButton
        theme={theme === "system" ? "system" : theme}
        toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
    </>
  );
}
