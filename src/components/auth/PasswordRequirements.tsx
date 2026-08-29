import { get } from '@/lib/i18n';
import { PASSWORD_RULES } from '@/lib/password-rules';
import type { PasswordRuleId } from '@/lib/password-rules';

interface PasswordRequirementsProps {
  password: string;
  auth: Record<string, unknown>;
}

export default function PasswordRequirements({
  password,
  auth,
}: Readonly<PasswordRequirementsProps>) {
  const requirementLabels: Record<PasswordRuleId, string> = {
    'min-length': get(auth, 'register.passwordMinLength'),
    uppercase: get(auth, 'register.passwordUppercase'),
    lowercase: get(auth, 'register.passwordLowercase'),
    number: get(auth, 'register.passwordNumber'),
  };

  const requirements = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    test: rule.test(password),
    label: requirementLabels[rule.id],
  }));

  return (
    <div className="mb-4 transition-all duration-300">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
        <p className="text-xs font-semibold text-gray-300 mb-2">
          {get(auth, 'register.passwordRequirements')}
        </p>
        <ul className="space-y-1.5">
          {requirements.map((req) => (
            <li key={req.id} className="flex items-center text-xs">
              <span className={`mr-2 ${req.test ? 'text-green-400' : 'text-gray-500'}`}>
                {req.test ? '✓' : '○'}
              </span>
              <span className={req.test ? 'text-green-300' : 'text-gray-400'}>{req.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
