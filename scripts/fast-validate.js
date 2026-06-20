import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseYaml(content) {
  const result = {};
  const lines = content.split('\n');
  const stack = [{ indent: -1, obj: result }];
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    
    const indent = line.search(/\S/);
    const key = line.substring(0, colonIdx).trim().replace(/['"]/g, '');
    let val = line.substring(colonIdx + 1).trim();
    
    const hashIdx = val.indexOf('#');
    if (hashIdx !== -1) {
      val = val.substring(0, hashIdx).trim();
    }
    val = val.replace(/['"]/g, '');
    
    if (val === '') {
      const newObj = {};
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      stack[stack.length - 1].obj[key] = newObj;
      stack.push({ indent, obj: newObj });
    } else {
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(val) && val !== '') val = Number(val);
      
      stack[stack.length - 1].obj[key] = val;
    }
  }
  return result;
}

function globToRegex(glob) {
  let regexStr = '^' + glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/\*/g, '.*')
    .replace(/\*\*/g, '.*')
    .replace(/\*\*/g, '.*') // prevent issues
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');
  return new RegExp(regexStr);
}

function main() {
  console.log('⚡ [fast-validate] 正在收集工作区变更并触发对应门禁校验...');
  
  const rootDir = path.resolve(__dirname, '..');
  const configYamlPath = path.join(rootDir, '.agents/config.yaml');
  
  if (!fs.existsSync(configYamlPath)) {
    console.error('❌ [fast-validate] 未找到配置文件 .agents/config.yaml');
    process.exit(1);
  }
  
  let config = {};
  try {
    config = parseYaml(fs.readFileSync(configYamlPath, 'utf-8'));
  } catch (e) {
    console.error(`❌ [fast-validate] 配置文件解析失败: ${e.message}`);
    process.exit(1);
  }
  
  const pipeline = config.verification_pipeline;
  if (!pipeline || Object.keys(pipeline).length === 0) {
    console.log('ℹ️ [fast-validate] 未在 config.yaml 中定义 validation pipeline，直接跳过。');
    process.exit(0);
  }
  
  // 1. 获取 Git 状态以找出修改过的文件
  let modifiedFiles = [];
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' });
    const lines = gitStatus.split('\n');
    for (let line of lines) {
      if (!line.trim()) continue;
      const filePart = line.substring(3).trim();
      const renameArrow = filePart.indexOf(' -> ');
      const filePath = renameArrow !== -1 ? filePart.substring(renameArrow + 4).trim() : filePart;
      modifiedFiles.push(filePath);
    }
  } catch (e) {
    console.error(`❌ [fast-validate] 无法运行 git status: ${e.message}`);
    process.exit(1);
  }
  
  if (modifiedFiles.length === 0) {
    console.log('✅ [fast-validate] 无修改的文件，验证自动通过。');
    process.exit(0);
  }
  
  console.log(`🔍 [fast-validate] 检测到被修改的文件: \n  - ${modifiedFiles.join('\n  - ')}`);
  
  // 2. 匹配验证规则
  const commandsToRun = new Set();
  
  for (let file of modifiedFiles) {
    for (let ruleKey in pipeline) {
      const rule = pipeline[ruleKey];
      if (!rule.match || !rule.cmd) continue;
      
      const regex = globToRegex(rule.match);
      if (regex.test(file)) {
        commandsToRun.add(rule.cmd);
      }
    }
  }
  
  if (commandsToRun.size === 0) {
    console.log('ℹ️ [fast-validate] 修改的文件没有匹配到任何极速检验门禁，跳过验证。');
    process.exit(0);
  }
  
  // 3. 执行验证命令
  console.log(`🚀 [fast-validate] 即将执行以下校验命令:`);
  commandsToRun.forEach(cmd => console.log(`  - ${cmd}`));
  
  let failed = false;
  let errors = [];
  
  for (let cmd of commandsToRun) {
    console.log(`\n🏃 [fast-validate] 正在执行: ${cmd}`);
    try {
      execSync(cmd, { stdio: 'inherit' });
      console.log(`✅ [fast-validate] 命令执行成功: ${cmd}`);
    } catch (e) {
      console.error(`❌ [fast-validate] 命令执行失败: ${cmd}`);
      failed = true;
      errors.push(`命令 [${cmd}] 失败。退出码: ${e.status || 1}`);
    }
  }
  
  if (failed) {
    console.error(`\n🚨 [fast-validate] 极速检验门禁未能全部通过！`);
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }
  
  console.log(`\n🎉 [fast-validate] 所有门禁校验全部通过！`);
  process.exit(0);
}

main();
