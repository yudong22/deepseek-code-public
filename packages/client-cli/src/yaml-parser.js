/**
 * 简易 YAML 解析器（仅支持平铺键值和嵌套对象，不支持数组和多行字符串）
 * 用于解析 .agents/config.yaml 中的流水线配置
 */
export function parseYaml(content) {
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
