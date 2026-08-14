
(() => {
  const root = document.getElementById("case-site");
  if (!root) return;

  const progressBar = document.getElementById("site-progress-bar");
  const updateProgress = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const progress = max > 0 ? (window.scrollY / max) * 100 : 0;
    progressBar.style.width = Math.min(100, Math.max(0, progress)) + "%";
  };
  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealItems = root.querySelectorAll(".reveal:not(.is-visible)");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -30px" });
    revealItems.forEach((item) => revealObserver.observe(item));
  }

  const categoryData = [
    { name: "Genetics GAP Process", count: 7, copy: "The sample shows how broad classification narrows attention before individual root-cause narratives are reviewed." },
    { name: "GAP Email Template", count: 7, copy: "Template errors illustrate how structured, generated text can reduce omissions and inconsistent submissions." },
    { name: "Provider Tax ID", count: 6, copy: "Provider-data mistakes can leave network status unresolved, creating downstream decision risk." },
    { name: "Test Name / CPT Identification", count: 6, copy: "Dense clinical documentation can make it difficult to distinguish a requested test from its code description." },
    { name: "Case Routing", count: 6, copy: "Routing errors point to missed visual cues and uncertainty about the correct specialty destination." },
    { name: "Case Documentation", count: 6, copy: "Documentation findings show the value of a final consistency check between notes, actions and outcome." },
    { name: "State Requirements", count: 6, copy: "State-requirement errors demonstrate why high-risk regulatory prompts need to appear at the moment of review." },
    { name: "Case Outcome", count: 6, copy: "Outcome mistakes can follow an otherwise correct review when the final decision is not connected to prior steps." },
    { name: "OON Benefits Verification", count: 5, copy: "Benefit-verification findings show how one skipped branch can change the entire case path." },
    { name: "Provider Network Status", count: 5, copy: "Network-status findings emphasize verification instead of assumptions based on prior cases." }
  ];
  const barChart = document.getElementById("bar-chart");
  const analysisCount = document.getElementById("analysis-count");
  const analysisName = document.getElementById("analysis-name");
  const analysisCopy = document.getElementById("analysis-copy");
  const selectCategory = (button, item) => {
    barChart.querySelectorAll(".bar-row").forEach((row) => row.setAttribute("aria-pressed", "false"));
    button.setAttribute("aria-pressed", "true");
    analysisCount.textContent = String(item.count);
    analysisName.textContent = item.name;
    analysisCopy.textContent = item.copy;
  };
  categoryData.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bar-row";
    button.setAttribute("aria-pressed", index === 0 ? "true" : "false");
    button.setAttribute("aria-label", item.name + ": " + item.count + " fictional records");
    button.innerHTML = '<span class="bar-label"></span><span class="bar-track"><span class="bar-fill"></span></span><span class="bar-count"></span>';
    button.querySelector(".bar-label").textContent = item.name;
    button.querySelector(".bar-fill").style.setProperty("--bar-width", ((item.count / 7) * 100) + "%");
    button.querySelector(".bar-count").textContent = String(item.count);
    button.addEventListener("click", () => selectCategory(button, item));
    barChart.appendChild(button);
  });

  const questions = root.querySelectorAll("[data-question]");
  const q3bBranch = document.getElementById("q3b-branch");
  const q3cBranch = document.getElementById("q3c-branch");
  const gapProcess = document.getElementById("gap-process");

  const clearQuestion = (question) => {
    question.querySelectorAll(":scope > .tool-answers > .tool-answer").forEach((button) => {
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
    });
    question.querySelectorAll(":scope > .tool-outcome").forEach((outcome) => outcome.classList.remove("show"));
  };
  const resetBranch = (branch) => {
    branch.classList.remove("show");
    branch.querySelectorAll("[data-question]").forEach(clearQuestion);
    branch.querySelectorAll(".tool-branch").forEach((item) => item.classList.remove("show"));
  };

  questions.forEach((question) => {
    question.querySelectorAll(":scope > .tool-answers > .tool-answer").forEach((button) => {
      button.setAttribute("aria-pressed", "false");
      const prompt = question.querySelector("h3")?.textContent.trim();
      if (prompt) button.setAttribute("aria-label", `${prompt}: ${button.textContent.trim()}`);
      button.addEventListener("click", () => {
        const answer = button.dataset.answer;
        clearQuestion(question);
        button.classList.add("selected");
        button.setAttribute("aria-pressed", "true");
        const outcome = question.querySelector(':scope > .tool-outcome[data-outcome="' + answer + '"]');
        if (outcome) outcome.classList.add("show");
        if (question.dataset.question === "q3a") {
          resetBranch(q3bBranch);
          if (answer === "yes") q3bBranch.classList.add("show");
        }
        if (question.dataset.question === "q3b") {
          resetBranch(q3cBranch);
          gapProcess.classList.remove("show");
          if (answer === "yes") gapProcess.classList.add("show");
          if (answer === "no") q3cBranch.classList.add("show");
        }
      });
    });
  });

  const fields = {
    caseNumber: document.getElementById("case-number"),
    testName: document.getElementById("test-name"),
    cptCode: document.getElementById("cpt-code"),
    agentName: document.getElementById("agent-name")
  };
  const templateOutput = document.getElementById("template-output");
  const copyTemplate = document.getElementById("copy-template");
  const buildTemplate = () => {
    const agent = fields.agentName.value.trim() || "<Agent Name>";
    return "Hello Specialty Team,\n\nPlease review the fictional genetics GAP request below.\nCase number: " + fields.caseNumber.value.trim() + "\nTest name: " + fields.testName.value.trim() + "\nCPT code: " + fields.cptCode.value.trim() + "\n\nThank you,\n" + agent;
  };
  const updateTemplate = () => {
    templateOutput.textContent = buildTemplate();
    copyTemplate.textContent = "Copy template";
  };
  Object.values(fields).forEach((field) => field.addEventListener("input", updateTemplate));
  copyTemplate.addEventListener("click", async () => {
    const text = buildTemplate();
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    copyTemplate.textContent = "Copied";
    window.setTimeout(() => { copyTemplate.textContent = "Copy template"; }, 1600);
  });

  document.getElementById("tool-reset").addEventListener("click", () => {
    questions.forEach(clearQuestion);
    q3bBranch.classList.remove("show");
    q3cBranch.classList.remove("show");
    gapProcess.classList.remove("show");
    Object.values(fields).forEach((field) => { field.value = ""; });
    updateTemplate();
  });
})();
