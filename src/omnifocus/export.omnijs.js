// Omni Automation script, evaluated inside OmniFocus via evaluateJavascript.
// The file is a single function expression; bridge.ts calls it with a params object
// and it returns a JSON string. Read-only: it never modifies the database.
(function (params) {
  const exclude = new Set(params.excludeFolders);
  const cutoff = new Date(Date.now() - params.completedWithinDays * 86400000);
  const iso = (d) => (d ? d.toISOString() : null);

  const folderPath = (folder) => {
    const path = [];
    for (let f = folder; f; f = f.parent) path.unshift(f.name);
    return path;
  };
  const tagPath = (tag) => {
    const path = [];
    for (let t = tag; t; t = t.parent) path.unshift(t.name);
    return path.join(" : ");
  };

  const projectStatus = (p) => {
    switch (p.status) {
      case Project.Status.Active: return "active";
      case Project.Status.OnHold: return "onHold";
      case Project.Status.Done: return "done";
      default: return "dropped";
    }
  };
  const taskStatus = (t) => {
    if (t.taskStatus === Task.Status.Completed) return "completed";
    if (t.taskStatus === Task.Status.Dropped) return "dropped";
    return "active";
  };
  const recent = (status, completedAt) =>
    status === "active" || status === "onHold" || (completedAt && completedAt >= cutoff);

  const projects = [];
  const projectIds = new Set();
  // Every project outside the sync scope (excluded folders, long-finished), by name only,
  // so migrations never create a same-name duplicate of something they can't see.
  const outOfScopeProjects = [];
  for (const p of flattenedProjects) {
    const path = folderPath(p.parentFolder);
    const status = projectStatus(p);
    const completedAt = p.completionDate || p.task.dropDate || null;
    if (path.some((name) => exclude.has(name)) || !recent(status, completedAt)) {
      outOfScopeProjects.push({ id: p.id.primaryKey, name: p.name, status, folderPath: path });
      continue;
    }
    projectIds.add(p.id.primaryKey);
    projects.push({
      id: p.id.primaryKey,
      name: p.name,
      note: p.note,
      status,
      folderPath: path,
      deferDate: iso(p.deferDate),
      dueDate: iso(p.dueDate),
      completedAt: iso(completedAt),
      modifiedAt: iso(p.task.modified),
    });
  }

  const tasks = [];
  for (const t of flattenedTasks) {
    // The inbox is triage and never syncs; every other task has a containing project.
    const project = t.containingProject;
    if (t.inInbox || !project || !projectIds.has(project.id.primaryKey)) continue;
    const status = taskStatus(t);
    const completedAt = t.completionDate || t.dropDate || null;
    if (!recent(status, completedAt)) continue;
    const parent = t.parent;
    const parentIsTask = parent && parent.id.primaryKey !== project.task.id.primaryKey;
    tasks.push({
      id: t.id.primaryKey,
      name: t.name,
      note: t.note,
      status,
      flagged: t.flagged,
      dueDate: iso(t.dueDate),
      deferDate: iso(t.deferDate),
      completedAt: iso(completedAt),
      estimatedMinutes: t.estimatedMinutes ?? null,
      tags: t.tags.map(tagPath),
      projectId: project.id.primaryKey,
      parentTaskId: parentIsTask ? parent.id.primaryKey : null,
      repeatRule: t.repetitionRule ? t.repetitionRule.ruleString : null,
      modifiedAt: iso(t.modified),
    });
  }

  return JSON.stringify({ exportedAt: new Date().toISOString(), projects, outOfScopeProjects, tasks });
})
