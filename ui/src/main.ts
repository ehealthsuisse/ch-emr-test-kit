import "./styles.css";
import { route, setNotFound, startRouter } from "./router";
import { clear, el } from "./dom";
import { renderCrud, renderHome, renderIg } from "./views";

const nav = document.getElementById("nav")!;
nav.append(el("a", { href: "#/" }, ["Home"]));

route("/", () => void renderHome());
route("/ig/:key", (p) => void renderIg(p));
route("/ig/:key/profile/:profile", (p) => void renderCrud(p));
setNotFound(() => {
  const root = document.getElementById("app")!;
  clear(root);
  root.append(el("div", { class: "error-box" }, ["Page not found"]));
});

startRouter();
