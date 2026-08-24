import { Mail, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { contactConfig } from '@/config/site';
import { ExternalLink } from '@/components/ui/ExternalLink';

/**
 * Backend-free contact section: click-to-WhatsApp and mailto only.
 * Hidden entirely when neither channel is configured (no fake buttons).
 */
export function ContactCTA({
  id,
  linkPosition
}: {
  id: string;
  linkPosition: string;
}) {
  const t = useTranslations('home.contact');
  const whatsappUrl = contactConfig.whatsappUrl;
  const email = contactConfig.email;

  if (!whatsappUrl && !email) return null;

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 py-10">
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <h2 id={`${id}-heading`} className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {t('heading')}
        </h2>
        <p className="mt-2 max-w-2xl text-base text-ink-muted">{t('description')}</p>
        <div className="mt-5 flex flex-wrap gap-3" data-link-position={linkPosition}>
          {whatsappUrl ? (
            <ExternalLink
              href={whatsappUrl}
              aria-label="WhatsApp Asharu"
              className="btn-primary"
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp
            </ExternalLink>
          ) : null}
          {email ? (
            <ExternalLink
              href={`mailto:${email}`}
              aria-label="Email Asharu"
              className="btn-secondary"
            >
              <Mail className="size-4" aria-hidden />
              Email
            </ExternalLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
