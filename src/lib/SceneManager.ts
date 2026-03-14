import type { Scene, SceneContext } from "../scenes/types";

export class SceneManager {
  private scenes = new Map<string, Scene>();
  private activeScene: Scene | null = null;
  private ctx: SceneContext;
  private selectorEl: HTMLElement | null = null;

  constructor(ctx: SceneContext) {
    this.ctx = ctx;
    this.selectorEl = document.getElementById("sidebar");

    // Wire up static sidebar scene buttons
    if (this.selectorEl) {
      this.selectorEl.querySelectorAll<HTMLButtonElement>(".scene-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.sceneId;
          if (id) this.switchScene(id);
        });
      });
    }
  }

  register(scene: Scene) {
    this.scenes.set(scene.id, scene);
    this.updateSelector();
  }

  private updateSelector() {
    if (!this.selectorEl) return;
    this.selectorEl.querySelectorAll<HTMLButtonElement>(".scene-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.sceneId === this.activeScene?.id);
    });
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

    // Reset VR camera rig so position/rotation doesn't carry between scenes
    if (this.ctx.xrManager) {
      this.ctx.xrManager.resetCameraRig();
    }

    this.activeScene = next;
    await next.init(this.ctx);

    const nextUI = next.getUI();
    if (nextUI) nextUI.style.display = "";

    // Sync URL with current scene
    const url = new URL(window.location.href);
    url.searchParams.set("scene", id);
    // Clear merger-specific params when leaving merger
    if (id !== "merger") {
      url.searchParams.delete("event");
    }
    history.replaceState(null, "", url.toString());

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

  /** Iterate registered scenes (for building mobile tabs, etc.) */
  getScenes(): IterableIterator<import("../scenes/types").Scene> {
    return this.scenes.values();
  }
}
