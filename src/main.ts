import "./styles/main.css";
import { initApp } from "./app";

let cleanup: (() => void) | undefined;
let disposed = false;
void initApp().then((dispose) => {
  if (disposed) dispose();
  else cleanup = dispose;
});
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposed = true;
    cleanup?.();
  });
}
