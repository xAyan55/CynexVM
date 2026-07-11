import { NodeClient } from './nodeClient';

export class ConsoleService {
  /**
   * Non-destructively validates the serial console of a domain on a given node.
   * Connects via virsh console and checks for login prompts.
   */
  public static async validate(nodeId: string | null, domainName: string): Promise<{ available: boolean; output: string }> {
    const consoleCheckScript = `
for i in {1..2}; do
  out=$(echo -e "\\n" | timeout 4 virsh console ${domainName} 2>/dev/null)
  if echo "$out" | grep -iqE "login:|debian gnu/linux|ubuntu login:"; then
    echo "available|$out"
    exit 0
  fi
done
echo "not_configured|$out"
exit 1
`.trim();

    const consoleScriptB64 = Buffer.from(consoleCheckScript).toString('base64');
    const res = await NodeClient.executeCommand(nodeId, `echo "${consoleScriptB64}" | base64 -d | bash`);
    
    const stdout = res.stdout.trim();
    const parts = stdout.split('|');
    const available = parts[0] === 'available';
    const output = parts.slice(1).join('|') || res.stderr || '';

    return { available, output };
  }
}
