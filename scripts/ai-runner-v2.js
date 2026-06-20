import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const taskId = process.argv[2] || `task-${Date.now()}`;
const taskDesc = process.argv[3] || "修改常规类型错误";

const rootDir = path.resolve(__dirname, '..');
const sandboxRoot = "/tmp/ai-workers";
const sandboxDir = path.join(sandboxRoot, taskId);

// 辅助打印彩色日志
function log(msg) {
  console.log(`\x1b[36m🚀 [OpenHands orchestrator]\x1b[0m ${msg}`);
}

function logError(msg) {
  console.error(`\x1b[31m❌ [OpenHands orchestrator]\x1b[0m ${msg}`);
}

// 模拟飞书通知，输出精致的终端通知卡片
function sendFeishuNotificationMock(taskId, taskDesc, success, message = '', healCount = 0) {
  console.log('\n┌──────────────────────────────────────────────────────────────────┐');
  if (success) {
    console.log(`│ \x1b[32m🎉  [飞书通知] AI 任务流水线执行成功！\x1b[0m                                 │`);
    console.log(`│ \x1b[1m任务分支\x1b[0m : ai/${taskId.padEnd(49)} │`);
    console.log(`│ \x1b[1m任务描述\x1b[0m : ${taskDesc.padEnd(49)} │`);
    console.log(`│ \x1b[1m自愈次数\x1b[0m : ${String(healCount).padEnd(49)} │`);
    console.log(`│ \x1b[1m状态\x1b[0m     : \x1b[32m极速校验全量通过，已落库本地原子提交。请合并并网！\x1b[0m     │`);
  } else {
    console.log(`│ \x1b[31m❌  [飞书通知] AI 任务流水线执行失败！\x1b[0m                                 │`);
    console.log(`│ \x1b[1m任务分支\x1b[0m : ai/${taskId.padEnd(49)} │`);
    console.log(`│ \x1b[1m任务描述\x1b[0m : ${taskDesc.padEnd(49)} │`);
    const cleanMsg = message.replace(/\n/g, ' ').substring(0, 45);
    console.log(`│ \x1b[1m错误原因\x1b[0m : \x1b[31m${cleanMsg.padEnd(49)}\x1b[0m │`);
    console.log(`│ \x1b[1m状态\x1b[0m     : \x1b[31m已安全回滚，影子沙箱已强制销毁。请架构师介入。\x1b[0m       │`);
  }
  console.log('└──────────────────────────────────────────────────────────────────┘\n');
}

// 运行 validation 门禁，流式打印并捕获输出
function runValidation(rootDir, sandboxDir) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn('node', [path.join(rootDir, 'scripts/fast-validate.js')], {
      cwd: sandboxDir,
      env: process.env
    });
    
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      output += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        const err = new Error(`极速门禁验证失败，退出码: ${code}`);
        err.output = output;
        reject(err);
      }
    });
  });
}

async function main() {
  try {
    log(`正在初始化影子沙箱工作区隔离...`);
    
    // 保证沙箱物理根目录存在
    if (!fs.existsSync(sandboxRoot)) {
      fs.mkdirSync(sandboxRoot, { recursive: true });
    }
    
    // 1. 利用 Git Worktree 创建影子物理沙箱并拉出新分支
    execSync(`git worktree add -b ai/${taskId} ${sandboxDir} main`);
    log(`影子沙箱物理路径已建立: ${sandboxDir}`);
    
    // 切换至沙箱路径
    process.chdir(sandboxDir);
    
    // 创建沙箱内部 .agents 配置目录以存放报错日志
    const sandboxAgentsDir = path.join(sandboxDir, '.agents');
    if (!fs.existsSync(sandboxAgentsDir)) {
      fs.mkdirSync(sandboxAgentsDir, { recursive: true });
    }
    
    // 2. 唤醒 Hermes 进行功能开发
    log(`唤醒主力 Agent (Hermes) 开始写代码...`);
    try {
      execSync(`bun run ${rootDir}/scripts/openhands-call.js --agent=hermes --prompt="${taskDesc}" --rules=${rootDir}/.agents/agent.md`, {
        stdio: 'inherit'
      });
    } catch (e) {
      throw new Error(`Hermes 运行期间发生错误: ${e.message}`);
    }
    
    // 3. 极速验证与 OpenCode CI 自愈循环
    let healCount = 0;
    const maxHeals = 3;
    let isPassed = false;
    
    while (!isPassed && healCount < maxHeals) {
      try {
        log(`触发本地极速验证门禁检查...`);
        await runValidation(rootDir, sandboxDir);
        isPassed = true;
      } catch (validationError) {
        healCount++;
        logError(`[验证失败] 检测到语法或编译报错！第 ${healCount} 次唤醒 OpenCode CI 自愈...`);
        
        // 捕获报错日志并写入沙箱
        const errorLog = validationError.output || validationError.message;
        const lastErrorLogPath = path.join(sandboxAgentsDir, 'last_error.log');
        fs.writeFileSync(lastErrorLogPath, errorLog);
        
        // 调用 OpenCode 进行自愈快修
        try {
          execSync(`bun run ${rootDir}/scripts/openhands-call.js --agent=opencode --rules=${rootDir}/.agents/agent.md --fix-target="${lastErrorLogPath}"`, {
            stdio: 'inherit'
          });
        } catch (e) {
          logError(`OpenCode 运行期间抛出致命异常: ${e.message}`);
        }
      }
    }
    
    if (!isPassed) {
      throw new Error(`OpenCode 自愈达到最大上限次数 (${maxHeals})，代码仍有编译/Lint错误，无法并网！`);
    }
    
    // 4. 收尾：执行原子 Commit
    log(`验证通过！正在生成本地原子提交...`);
    execSync(`git add . && git commit -m "ai(${taskId}): ${taskDesc} (自愈次数: ${healCount})"`);
    
    // 5. 善后处理：回到宿主目录，卸载 Worktree，保留分支供人工并网审计
    process.chdir(rootDir);
    log(`清理影子物理沙箱...`);
    execSync(`git worktree remove ${sandboxDir}`);
    
    // 发送成功飞书通知
    sendFeishuNotificationMock(taskId, taskDesc, true, '', healCount);
    
  } catch (error) {
    logError(`流水线崩溃，正在执行安全回滚...`);
    logError(`错误详情: ${error.message}`);
    
    // 安全返回主目录并进行强力清理
    process.chdir(rootDir);
    
    try {
      if (fs.existsSync(sandboxDir)) {
        execSync(`git worktree remove ${sandboxDir} --force`);
      }
      // 强行删除临时开发分支
      execSync(`git branch -D ai/${taskId}`);
    } catch (e) {
      logError(`清理资源期间发生异常: ${e.message}`);
    }
    
    // 发送失败通知
    sendFeishuNotificationMock(taskId, taskDesc, false, error.message);
    process.exit(1);
  }
}

main();
