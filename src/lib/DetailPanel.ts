import type { DetailTab } from "../scenes/types";

export class DetailPanel {
  private el: HTMLElement;
  private titleEl: HTMLElement;
  private tabsEl: HTMLElement;
  private bodyEl: HTMLElement;
  private tabs: DetailTab[] = [];
  private activeTabId: string | null = null;

  constructor() {
    this.el = document.getElementById("detail-panel")!;
    this.titleEl = this.el.querySelector(".detail-title")!;
    this.tabsEl = this.el.querySelector(".detail-tabs")!;
    this.bodyEl = this.el.querySelector(".detail-body")!;

    // Wire close button
    const closeBtn = this.el.querySelector(".detail-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.close());
    }
  }

  open() {
    document.body.classList.add("detail-open");
  }

  close() {
    document.body.classList.remove("detail-open");
  }

  toggle() {
    document.body.classList.toggle("detail-open");
  }

  get isOpen(): boolean {
    return document.body.classList.contains("detail-open");
  }

  mount(title: string, tabs: DetailTab[]) {
    this.titleEl.textContent = title;
    this.tabs = tabs;
    this.tabsEl.innerHTML = "";
    this.bodyEl.innerHTML = "";

    // If only 1 tab, hide tab bar
    if (tabs.length <= 1) {
      this.tabsEl.style.display = "none";
    } else {
      this.tabsEl.style.display = "flex";
      for (const tab of tabs) {
        const btn = document.createElement("button");
        btn.className = "detail-tab-btn";
        btn.textContent = tab.label;
        btn.dataset.tabId = tab.id;
        btn.addEventListener("click", () => this.setActiveTab(tab.id));
        this.tabsEl.appendChild(btn);
      }
    }

    // Mount first tab
    if (tabs.length > 0) {
      this.setActiveTab(tabs[0].id);
    }
  }

  clear() {
    // Detach (not destroy) tab elements — return them to avoid losing DOM state
    while (this.bodyEl.firstChild) {
      this.bodyEl.removeChild(this.bodyEl.firstChild);
    }
    this.tabsEl.innerHTML = "";
    this.tabs = [];
    this.activeTabId = null;
  }

  setActiveTab(id: string) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;

    this.activeTabId = id;

    // Update tab button active states
    this.tabsEl.querySelectorAll<HTMLButtonElement>(".detail-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tabId === id);
    });

    // Swap body content — detach current, attach new
    while (this.bodyEl.firstChild) {
      this.bodyEl.removeChild(this.bodyEl.firstChild);
    }
    this.bodyEl.appendChild(tab.element);
  }
}
