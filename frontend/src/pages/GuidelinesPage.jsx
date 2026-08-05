import { motion } from 'framer-motion'
import { FileText, CheckCircle, AlertCircle, Upload, Calendar, Users } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { Card } from '@/components/ui/Card.jsx'

export function GuidelinesPage() {
  usePageSeo({
    title: 'Submission Guidelines',
    description: 'Guidelines and requirements for submitting your project to Smart Kopargaon Hackathon.',
  })

  return (
    <div className="min-h-screen bg-[rgb(var(--page-bg))] py-20">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center justify-center rounded-full bg-brand-500/10 p-3">
              <FileText className="h-8 w-8 text-brand-600" />
            </div>
            <h1 className="font-display text-4xl font-bold text-ink-900 sm:text-5xl">
              Submission Guidelines
            </h1>
            <p className="mt-4 text-lg text-ink-600">
              Please follow these guidelines carefully when submitting your project
            </p>
          </div>

          {/* Submission Requirements */}
          <Card className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-ink-900">
              <CheckCircle className="h-6 w-6 text-brand-600" />
              Submission Requirements
            </h2>
            <div className="space-y-4 text-ink-700">
              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-600">
                  1
                </span>
                <div>
                  <h3 className="font-semibold">Project Title & Description</h3>
                  <p className="mt-1 text-sm text-ink-600">
                    Provide a clear, concise title (max 100 characters) and detailed description (500-1000 words) explaining your solution.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-600">
                  2
                </span>
                <div>
                  <h3 className="font-semibold">Technical Documentation</h3>
                  <p className="mt-1 text-sm text-ink-600">
                    Include architecture diagrams, technology stack, installation instructions, and API documentation if applicable.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-600">
                  3
                </span>
                <div>
                  <h3 className="font-semibold">Source Code</h3>
                  <p className="mt-1 text-sm text-ink-600">
                    Provide a public GitHub repository link with complete source code, README, and setup instructions. Code must be well-documented.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-600">
                  4
                </span>
                <div>
                  <h3 className="font-semibold">Demo Video</h3>
                  <p className="mt-1 text-sm text-ink-600">
                    Submit a 3-5 minute video demonstrating your solution. Upload to YouTube or Google Drive and share the link.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-600">
                  5
                </span>
                <div>
                  <h3 className="font-semibold">Presentation Deck</h3>
                  <p className="mt-1 text-sm text-ink-600">
                    Upload a PDF presentation (6-7 slides) covering problem statement, solution, implementation, and impact.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* File Formats */}
          <Card className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-ink-900">
              <Upload className="h-6 w-6 text-brand-600" />
              Acceptable File Formats
            </h2>
            <div className="space-y-3 text-ink-700">
              <div>
                <span className="font-semibold">Documents:</span> PDF, DOC, DOCX
              </div>
              <div>
                <span className="font-semibold">Presentations:</span> PDF, PPT, PPTX
              </div>
              <div>
                <span className="font-semibold">Videos:</span> YouTube/Vimeo links, MP4 (max 500MB)
              </div>
              <div>
                <span className="font-semibold">Code:</span> GitHub/GitLab repository links
              </div>
              <div>
                <span className="font-semibold">Images:</span> JPG, PNG (max 5MB each)
              </div>
            </div>
          </Card>

          {/* Important Dates */}
          <Card className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-ink-900">
              <Calendar className="h-6 w-6 text-brand-600" />
              Important Deadlines
            </h2>
            <div className="space-y-3 text-ink-700">
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-semibold">Idea Submission:</span> Submit your initial concept during the registration phase
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-semibold">Final Submission:</span> Complete all requirements before the hackathon finale
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <span className="font-semibold">Late submissions will not be accepted</span> - ensure you submit before the deadline
                </div>
              </div>
            </div>
          </Card>

          {/* Evaluation Criteria */}
          <Card className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-ink-900">
              <Users className="h-6 w-6 text-brand-600" />
              Evaluation Criteria
            </h2>
            <div className="space-y-4 text-ink-700">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold">Innovation & Creativity</span>
                  <span className="text-sm text-ink-500">25%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full w-1/4 bg-brand-500"></div>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold">Technical Implementation</span>
                  <span className="text-sm text-ink-500">25%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full w-1/4 bg-brand-500"></div>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold">Impact & Feasibility</span>
                  <span className="text-sm text-ink-500">30%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full w-[30%] bg-brand-500"></div>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold">Presentation & Demo</span>
                  <span className="text-sm text-ink-500">20%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full w-1/5 bg-brand-500"></div>
                </div>
              </div>
            </div>
          </Card>

          {/* Important Notes */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-ink-900">
              <AlertCircle className="h-6 w-6 text-amber-600" />
              Important Notes
            </h2>
            <ul className="space-y-2 text-sm text-ink-700">
              <li className="flex gap-2">
                <span className="text-amber-600">•</span>
                <span>All submissions must be original work created during the hackathon period</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600">•</span>
                <span>Plagiarism will result in immediate disqualification</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600">•</span>
                <span>Teams must be available for live demos during the evaluation phase</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600">•</span>
                <span>All code and documentation must be in English</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600">•</span>
                <span>Contact the organizing team immediately if you face technical issues during submission</span>
              </li>
            </ul>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
