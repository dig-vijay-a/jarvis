import express from 'express';
import SkillRegistryService from '../services/skillRegistryService.js';

const router = express.Router();

// 1. List all skills
router.get('/', async (req, res) => {
  try {
    const skills = await SkillRegistryService.getAllSkills();
    res.json({ success: true, count: skills.length, skills });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get skill by key
router.get('/:skillKey', async (req, res) => {
  try {
    const skill = await SkillRegistryService.getSkillByKey(req.params.skillKey);
    if (!skill) {
      return res.status(404).json({ success: false, error: 'Skill not found' });
    }
    res.json({ success: true, skill });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Register skill
router.post('/', async (req, res) => {
  try {
    const { skill_key, name, description, version, schema_definition, permissions, author } = req.body;
    const created = await SkillRegistryService.registerSkill({
      skill_key,
      name,
      description,
      version,
      schema_definition,
      permissions,
      author
    });
    res.json({ success: true, skill: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Update skill
router.put('/:id', async (req, res) => {
  try {
    const updated = await SkillRegistryService.updateSkill(req.params.id, req.body);
    res.json({ success: true, skill: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Toggle skill enable/disable
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { is_enabled } = req.body;
    const result = await SkillRegistryService.toggleSkill(req.params.id, is_enabled);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Execute skill
router.post('/:skillKey/execute', async (req, res) => {
  try {
    const { args, callingAgent } = req.body;
    const result = await SkillRegistryService.executeSkill(req.params.skillKey, args || {}, callingAgent || 'user');
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Test skill
router.post('/:skillKey/test', async (req, res) => {
  try {
    const testResult = await SkillRegistryService.testSkill(req.params.skillKey);
    res.json({ success: true, testResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
