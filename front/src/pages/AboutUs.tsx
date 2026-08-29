import { useTranslation } from 'react-i18next'
import AccountLayout, { AccountHeader } from '../components/account/AccountLayout'

const TECH_STACK = ['React 19', 'TypeScript', 'Vite', 'Tailwind CSS', 'FastAPI', 'LangChain', 'MySQL', 'Redis', 'ChromaDB']

const FEATURE_KEYS = ['aiChat', 'noteTaking', 'knowledgeBase', 'review'] as const

export default function AboutUs() {
  const { t } = useTranslation()

  return (
    <AccountLayout>
      <AccountHeader
        breadcrumb={t('account.breadcrumb')}
        title={t('about.title')}
        subtitle={t('account.aboutSubtitle')}
      />

      <div className="account-body">
        <section className="account-about-hero">
          <div className="account-about-hero-copy">
            <h2>云舒卷</h2>
            <p>{t('about.description')}</p>
          </div>
          <div className="account-about-hero-art">
            <img src="/illustrations/study-cloud.png" alt="" />
          </div>
        </section>

        <section className="account-panel">
          <h2 className="account-panel-title">{t('about.techStack')}</h2>
          <div className="account-tech-chips">
            {TECH_STACK.map((tech) => (
              <span key={tech} className="account-tech-chip">{tech}</span>
            ))}
          </div>
        </section>

        <section className="account-panel">
          <h2 className="account-panel-title">{t('about.features')}</h2>
          <div className="account-feature-list">
            {FEATURE_KEYS.map((key) => (
              <div key={key} className="account-feature-item">
                <i />
                {t(`about.featureList.${key}`)}
              </div>
            ))}
          </div>
        </section>
      </div>
    </AccountLayout>
  )
}
