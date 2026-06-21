import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { parseYaml } from './yaml-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function globToRegex(glob) {
  let regexStr = '^' + glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/\*/g, '.*')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');
  return new RegExp(regexStr);
}

export async function fastValidate({ rootDir, sandboxDir } = {}) {
  const resolvedRootDir = rootDir || path.resolve(__dirname, '../../..');
  const resolvedSandboxDir = sandboxDir || process.cwd();

  console.log('⚡ [fast-validate] 正在收集工作区变更并触发对应门禁校验...');
  
  const configYamlPath = path.join(resolvedRootDir, '.agents/config.yaml');
  
  if (!fs.existsSync(configYamlPath)) {
    throw new Error(`未找到配置文件 ${configYamlPath}`);
  }
  
  let config = {};
  try {
    config = parseYaml(fs.readFileSync(configYamlPath, 'utf-8'));
  } catch (e) {
    throw new Error(`配置文件解析失败: ${e.message}`);
  }
  
  const pipeline = config.verification_pipeline;
  if (!pipeline || Object.keys(pipeline).length === 0) {
    console.log('ℹ️ [fast-validate] 未在 config.yaml 中定义 validation pipeline，直接跳过。');
    return;
  }
  
  // 1. 获取 Git 状态以找出修改过的文件
  let modifiedFiles = [];
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8', cwd: resolvedSandboxDir });
    const lines = gitStatus.split('\n');
    for (let line of lines) {
      if (!line.trim()) continue;
      const filePart = line.substring(3).trim();
      const renameArrow = filePart.indexOf(' -> ');
      const filePath = renameArrow !== -1 ? filePart.substring(renameArrow + 4).trim() : filePart;
      modifiedFiles.push(filePath);
    }
  } catch (e) {
    throw new Error(`无法运行 git status: ${e.message}`);
  }
  
  if (modifiedFiles.length === 0) {
    console.log('✅ [fast-validate] 无修改的文件，验证自动通过。');
    return;
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
    return;
  }
  
  // 3. 执行验证命令
  console.log(`🚀 [fast-validate] 即将执行以下校验命令:`);
  commandsToRun.forEach(cmd => console.log(`  - ${cmd}`));
  
  let failed = false;
  let errors = [];
  
  for (let cmd of commandsToRun) {
    console.log(`\n🏃 [fast-validate] 正在执行: ${cmd}`);
    try {
      const COMMAND_TIMEOUT_MS = parseInt(process.env.FAST_VALIDATE_TIMEOUT || "60000", 10);
      const output = execSync(cmd, {
        cwd: resolvedSandboxDir,
        timeout: COMMAND_TIMEOUT_MS,
        killSignal: 'SIGTERM',
      });
      if (output) {
        process.stdout.write(output.toString());
      }
      console.log(`✅ [fast-validate] 命令执行成功: ${cmd}`);
    } catch (e) {
      const outStr = e.stdout ? e.stdout.toString() : '';
      const errStr = e.stderr ? e.stderr.toString() : '';
      if (outStr) process.stdout.write(outStr);
      if (errStr) process.stderr.write(errStr);
      console.error(`❌ [fast-validate] 命令执行失败: ${cmd}`);
      failed = true;
      errors.push(`命令 [${cmd}] 失败。退出码: ${e.status || 1}\n报错信息:\n${outStr}\n${errStr}`);
    }
  }
  
  if (failed) {
    console.error(`\n🚨 [fast-validate] 极速检验门禁未能全部通过！`);
    errors.forEach(err => console.error(`  - ${err}`));
    throw new Error(`极速门禁验证失败:\n${errors.join('\n')}`);
  }
  
  console.log(`\n🎉 [fast-validate] 所有门禁校验全部通过！`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fastValidate()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(`❌ [fast-validate] 执行失败: ${err.message}`);
      process.exit(1);
    });
}
