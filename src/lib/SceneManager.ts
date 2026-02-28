import type { Scene, SceneContext } from "../scenes/types";

export class SceneManager {
  private scenes = new Map<string, Scene>();
  private activeScene: Scene | null = null;
  private ctx: SceneContext;
  private selectorEl: HTMLElement | null = null;

  constructor(ctx: SceneContext) {
    this.ctx = ctx;
    this.selectorEl = document.getElementById("scene-selector");
  }

  register(scene: Scene) {
    this.scenes.set(scene.id, scene);
    this.updateSelector();
  }

  private updateSelector() {
    if (!this.selectorEl) return;
    const container = this.selectorEl.querySelector(".scene-tabs");
    if (!container) return;

    container.innerHTML = "";
    for (const scene of this.scenes.values()) {
      const btn = document.createElement("button");
      btn.className = "scene-tab";
      btn.textContent = scene.label;
      btn.dataset.sceneId = scene.id;
      if (this.activeScene?.id === scene.id) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", () => this.switchScene(scene.id));
      container.appendChild(btn);
    }
  }

  async switchScene(id: string) {
    const next = this.scenes.get(id);
    if (!next || next === this.activeScene) return;

    // Dispose current scene
    if (this.activeScene) {
      const currentUI = this.activeScene.getUI();
      if (currentUI) currentUI.style.display = "none";
      this.activeScene.dispose();
    }

    this.activeScene = next;
    await next.init(this.ctx);

    const nextUI = next.getUI();
    if (nextUI) nextUI.style.display = "";

    this.updateSelector();
  }

  update(dt: number, elapsed: number) {
    this.activeScene?.update(dt, elapsed);
  }

  onResize(w: number, h: number) {
    this.activeScene?.onResize(w, h);
  }

  get current(): Scene | null {
    return this.activeScene;
  }

  get currentId(): string | null {
    return this.activeScene?.id ?? null;
  }
}
