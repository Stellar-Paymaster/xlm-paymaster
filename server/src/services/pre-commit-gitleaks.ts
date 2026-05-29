import { spawnSync } from 'child_process';

/**
 * Pre-commit hook script to run Gitleaks on staged files.
 * Prevents secrets from being committed to the repository.
 */
function runGitleaks(): void {
  console.log('Running Gitleaks pre-commit secret scan...');
  
  // Check if gitleaks is installed
  const check = spawnSync('gitleaks', ['version']);
  if (check.error) {
    console.error('Error: gitleaks is not installed or not in PATH.');
    console.error('Please install gitleaks (https://github.com/gitleaks/gitleaks) to commit code.');
    process.exit(1); // Block the commit to strictly enforce compliance
  }

  // Run gitleaks on staged files
  const result = spawnSync('gitleaks', ['protect', '--staged', '--verbose'], { stdio: 'inherit' });

  if (result.status !== 0) {
    console.error('\n[!] Gitleaks has detected potential secrets in your staged files!');
    console.error('Commit blocked. Please remove the secrets, stage the changes, and try again.');
    process.exit(1);
  }
}

runGitleaks();