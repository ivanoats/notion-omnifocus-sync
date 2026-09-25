// Omni Automation script: create top-level OmniFocus projects for Notion-only projects.
// params.projects: [{ key, name, status, deferDate, dueDate }]; returns JSON { key: newProjectId }.
// Only run behind --write on the sync host (the CLI enforces this).
(function (params) {
  const STATUS = {
    active: Project.Status.Active,
    onHold: Project.Status.OnHold,
    done: Project.Status.Done,
    dropped: Project.Status.Dropped,
  };
  const created = {};
  for (const p of params.projects) {
    // Idempotent: if an earlier run created it but failed before Notion got the OF ID, reuse it.
    const existing = flattenedProjects.find((x) => x.name === p.name);
    if (existing) {
      created[p.key] = existing.id.primaryKey;
      continue;
    }
    const project = new Project(p.name);
    if (p.deferDate) project.deferDate = new Date(p.deferDate);
    if (p.dueDate) project.dueDate = new Date(p.dueDate);
    project.status = STATUS[p.status] || Project.Status.Active;
    created[p.key] = project.id.primaryKey;
  }
  return JSON.stringify(created);
})
