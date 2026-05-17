// Debug: generate workflow JSONs for 1, 3, 7, 10 images
const fs = require('fs')
const path = require('path')

const template = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'generators', 'image', 'flux_img2img_multi.json'), 'utf-8'))

const MODULES = [
  { load: '198', scale: '270', vae: '206', ref: '204' },
  { load: '229', scale: '272', vae: '262', ref: '257' },
  { load: '233', scale: '273', vae: '263', ref: '258' },
  { load: '236', scale: '274', vae: '264', ref: '259' },
  { load: '239', scale: '275', vae: '265', ref: '260' },
  { load: '282', scale: '283', vae: '284', ref: '285' },
  { load: '286', scale: '287', vae: '288', ref: '289' },
  { load: '290', scale: '291', vae: '292', ref: '293' },
  { load: '294', scale: '295', vae: '296', ref: '297' },
  { load: '298', scale: '299', vae: '300', ref: '301' },
  { load: '302', scale: '303', vae: '304', ref: '305' },
  { load: '306', scale: '307', vae: '308', ref: '309' },
  { load: '310', scale: '311', vae: '312', ref: '313' },
  { load: '314', scale: '315', vae: '316', ref: '317' },
  { load: '318', scale: '319', vae: '320', ref: '321' },
  { load: '322', scale: '323', vae: '324', ref: '325' },
  { load: '326', scale: '327', vae: '328', ref: '329' },
  { load: '330', scale: '331', vae: '332', ref: '333' },
  { load: '334', scale: '335', vae: '336', ref: '337' },
  { load: '338', scale: '339', vae: '340', ref: '341' },
]
const CLIP_NODE = '6'
const GUIDER_NODE = '278'

function buildWorkflow(refCount, prompt = 'test') {
  const workflow = JSON.parse(JSON.stringify(template))
  const count = Math.min(refCount, MODULES.length)

  for (let i = 0; i < MODULES.length; i++) {
    const mod = MODULES[i]
    if (i < count) {
      workflow[mod.load].inputs.image = `ref_image_${i + 1}.png`
      if (i === 0) {
        workflow[mod.ref].inputs.conditioning = [CLIP_NODE, 0]
      } else {
        const prevRef = MODULES[i - 1].ref
        workflow[mod.ref].inputs.conditioning = [prevRef, 0]
      }
    } else {
      delete workflow[mod.load]
      delete workflow[mod.scale]
      delete workflow[mod.vae]
      delete workflow[mod.ref]
    }
  }

  const lastRef = MODULES[count - 1].ref
  if (workflow[GUIDER_NODE]) {
    workflow[GUIDER_NODE].inputs.positive = [lastRef, 0]
  }

  // Set prompt
  for (const nodeId in workflow) {
    const node = workflow[nodeId]
    if (node._meta?.title?.startsWith('$promt') || node._meta?.title?.startsWith('$prompt')) {
      node.inputs.value = prompt
    }
  }

  return workflow
}

// ====== VERIFICATION ======
function verify(workflow, refCount, label) {
  const errors = []
  const nodeIds = Object.keys(workflow)

  // 1. Check that all module nodes for mod 1..refCount exist
  for (let i = 0; i < refCount; i++) {
    const mod = MODULES[i]
    for (const key of ['load', 'scale', 'vae', 'ref']) {
      if (!nodeIds.includes(mod[key])) {
        errors.push(`Module ${i + 1} ${key} (${mod[key]}) is MISSING`)
      }
    }
  }

  // 2. Check that modules beyond refCount are deleted
  for (let i = refCount; i < MODULES.length; i++) {
    const mod = MODULES[i]
    for (const key of ['load', 'scale', 'vae', 'ref']) {
      if (nodeIds.includes(mod[key])) {
        errors.push(`Module ${i + 1} ${key} (${mod[key]}) should be DELETED but still exists`)
      }
    }
  }

  // 3. Check RefLat chain
  for (let i = 0; i < refCount; i++) {
    const mod = MODULES[i]
    const refNode = workflow[mod.ref]
    if (!refNode) continue
    const cond = refNode.inputs?.conditioning
    if (!cond || cond.length < 1) {
      errors.push(`Module ${i + 1} ref (${mod.ref}) has NO conditioning`)
      continue
    }
    const expectedSource = i === 0 ? CLIP_NODE : MODULES[i - 1].ref
    if (cond[0] !== expectedSource) {
      errors.push(`Module ${i + 1} ref (${mod.ref}) conditioning source: ${cond[0]}, expected: ${expectedSource}`)
    }
  }

  // 4. Check Guider points to last RefLat
  const guider = workflow[GUIDER_NODE]
  const expectedLastRef = MODULES[refCount - 1].ref
  if (guider) {
    const positive = guider.inputs?.positive
    if (!positive || positive[0] !== expectedLastRef) {
      errors.push(`Guider positive: ${positive?.[0] || 'missing'}, expected: ${expectedLastRef}`)
    }
  }

  // 5. Check prompt node exists
  const hasPrompt = Object.values(workflow).some((n) =>
    n._meta?.title && (n._meta.title.startsWith('$promt') || n._meta.title.startsWith('$prompt'))
  )
  if (!hasPrompt) errors.push('Prompt node missing')

  // 6. Report node count
  console.log(`[${label}] ${nodeIds.length} nodes, ${refCount} modules → ${errors.length === 0 ? '✅ OK' : '❌ ' + errors.length + ' errors'}`)
  if (errors.length > 0) {
    for (const e of errors) console.log(`  ❌ ${e}`)
  }
}

// Generate and verify
const cases = [1, 3, 7, 10, 20]
for (const count of cases) {
  const label = `${count} image${count > 1 ? 's' : ''}`
  const wf = buildWorkflow(count, `Debug ${label}`)
  verify(wf, count, label)
  fs.writeFileSync(path.join(__dirname, `debug_${count}_images.json`), JSON.stringify(wf, null, 2))
  console.log(`  → debug_${count}_images.json saved`)
}
