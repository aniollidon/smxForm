// Converteix una llista plana de preguntes en blocs: títols de secció, grups i preguntes soltes.
export function buildBlocks(items, groups = [], get = (x) => x) {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const blocks = [];
  items.forEach((item, index) => {
    const q = get(item);
    if (q.sectionTitle) blocks.push({ type: 'section', title: q.sectionTitle });
    const group = q.groupId != null ? groupById.get(q.groupId) : null;
    const last = blocks[blocks.length - 1];
    if (group && last?.type === 'group' && last.group.id === group.id) last.entries.push({ item, index });
    else if (group) blocks.push({ type: 'group', group, entries: [{ item, index }] });
    else blocks.push({ type: 'single', item, index });
  });
  return blocks;
}

export function buildPages(items, groups, get) {
  const pages = [];
  for (const block of buildBlocks(items, groups, get)) {
    if (block.type === 'section' || !pages.length) pages.push({ title: block.type === 'section' ? block.title : null, blocks: [] });
    if (block.type !== 'section') pages[pages.length - 1].blocks.push(block);
  }
  return pages;
}

export const blockQuestions = (block) => (block.type === 'group' ? block.entries.map((e) => e.item) : [block.item]);

export function isAnswered(q, answer) {
  if (q.type === 'IMAGE_UPLOAD') return !!answer?.fileUrl;
  const value = answer?.value;
  if (value === null || value === undefined) return false;
  switch (q.type) {
    case 'MCQ': return Array.isArray(value) && value.length > 0;
    case 'TRUE_FALSE': return typeof value === 'boolean';
    case 'MATCHING':
    case 'ORDERING':
    case 'IMAGE_LABEL': return typeof value === 'object' && Object.values(value).some((v) => v !== '' && v != null);
    case 'SHORT_TEXT':
    case 'CALCULATED':
    case 'LONG_TEXT': return String(value).trim() !== '';
    case 'DRAWING': return Array.isArray(value?.strokes) && value.strokes.length > 0;
    default: return false;
  }
}

// Reconstrueix la llista d'ordre/seccions/grups que espera el servidor a partir dels elements de l'editor.
export function toLayoutItems(entries) {
  const out = [];
  let title = null;
  for (const entry of entries) {
    if (entry.kind === 'section') { title = entry.title; continue; }
    const list = entry.kind === 'group' ? entry.questions : [entry.q];
    list.forEach((q, i) => {
      out.push({ id: q.id, sectionTitle: i === 0 ? title : null, groupId: entry.kind === 'group' ? entry.group.id : null });
      if (i === 0) title = null;
    });
  }
  return out;
}

// Inversa: elements d'editor a partir de les preguntes ordenades i els grups.
export function toEditorEntries(questions, groups) {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const entries = [];
  for (const q of questions) {
    if (q.sectionTitle) entries.push({ kind: 'section', title: q.sectionTitle });
    const group = q.groupId != null ? groupById.get(q.groupId) : null;
    const last = entries[entries.length - 1];
    if (group && last?.kind === 'group' && last.group.id === group.id) last.questions.push(q);
    else if (group) entries.push({ kind: 'group', group, questions: [q] });
    else entries.push({ kind: 'question', q });
  }
  // Grups nous encara sense preguntes.
  for (const group of groups) {
    if (!questions.some((q) => q.groupId === group.id)) entries.push({ kind: 'group', group, questions: [] });
  }
  return entries;
}
