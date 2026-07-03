export const APP = {
  name: 'Smart Kopargaon Hackathon',
  shortName: 'SKH',
  university: 'Sanjivani University',
  region: 'Kopargaon Taluka',
  contactEmail: 'skh@sanjivani.edu.in',
  contactPhone: '+91 74983 11334',
  venue: 'Sanjivani University Innovation Campus',
}

// Student coordinators & team leaders — shown in the footer and Contact page.
export const COORDINATORS = {
  coordinators: [
    { name: 'Ashish Pardeshi', phone: '7498311334', role: 'Student Coordinator' },
    { name: 'Avani Kulkarni', phone: '9356138851', role: 'Student Coordinator' },
  ],
  leaders: [
    { name: 'Atharva Deshmukh', phone: '7517647277' },
    { name: 'Aditya Mhaismale', phone: '9284093469' },
  ],
}

// External UMS event-registration portal (Sanjivani University).
// Single source of truth used by the hero CTA, auth page, and How to Register page.
export const REGISTRATION_URL = 'https://ums.sanjivani.edu.in//EventRegistration/D0712D97-8DF'

export const TRACKS = [
  {
    id: 'health',
    title: 'Health',
    description: 'Primary care access, diagnostics, telemedicine, and community health for rural and urban populations.',
    icon: 'HeartPulse',
  },
  {
    id: 'education',
    title: 'Education',
    description: 'Learning outcomes, vernacular content, skill development, and equitable access for students.',
    icon: 'GraduationCap',
  },
  {
    id: 'transportation',
    title: 'Transportation',
    description: 'Public transit, traffic systems, last-mile mobility, and intelligent infrastructure for safer roads.',
    icon: 'Bus',
  },
  {
    id: 'food-safety',
    title: 'Food Safety & Security',
    description: 'Food traceability, quality assurance, supply chain integrity, and nutritional access programs.',
    icon: 'Utensils',
  },
  {
    id: 'waste-management',
    title: 'Waste Management',
    description: 'Solid waste handling, recycling systems, sanitation, and circular-economy solutions.',
    icon: 'Recycle',
  },
  {
    id: 'agriculture',
    title: 'Agriculture',
    description: 'Crop intelligence, farmer enablement, irrigation efficiency, and agri-tech for regional farmers.',
    icon: 'Sprout',
  },
  {
    id: 'industry-msme',
    title: 'Industry & MSME Innovation',
    description: 'Operational efficiency, quality control, safety, automation, and digital tooling for local industries.',
    icon: 'Factory',
  },
  {
    id: 'open-innovation',
    title: 'Open Innovation',
    description: 'Creative solutions and breakthrough ideas that don\'t fit traditional categories but solve real-world problems.',
    icon: 'Lightbulb',
  },
]

export const TIMELINE = [
  { phase: 'Registration Opens', date: 'Jun 1, 2026', status: 'live' },
  { phase: 'Problem Statements Live', date: 'Jun 15, 2026', status: 'upcoming' },
  { phase: 'Idea Screening', date: 'Jul 1, 2026', status: 'upcoming' },
  { phase: 'Grand Hackathon', date: 'Aug 20–22, 2026', status: 'upcoming' },
  { phase: 'Showcase & Awards', date: 'Aug 23, 2026', status: 'upcoming' },
]

export const SPONSORS = [
  { name: 'District Administration', tier: 'host' },
  { name: 'Industry Consortium', tier: 'platinum' },
  { name: 'Innovation Council', tier: 'gold' },
  { name: 'Startup Hub Nashik', tier: 'silver' },
]

export const FAQ_ITEMS = [
  {
    q: 'Who can participate?',
    a: 'Students from recognized institutions across India may form teams. Cross-disciplinary teams are encouraged. Each participant must have a valid college ID.',
  },
  {
    q: 'What is the team size?',
    a: 'Each team must have a minimum of 2 and a maximum of 4 members, including one team leader. The exact limits may be adjusted by the organizers — check the registration page for the current requirements.',
  },
  {
    q: 'Is there a registration fee?',
    a: 'Yes, there is a registration fee of ₹400 per team (not per person). Payment must be completed before the registration deadline to confirm your spot.',
  },
  {
    q: 'How are submissions evaluated?',
    a: 'A jury panel scores innovation, feasibility, impact for Kopargaon Taluka, and demo quality using a structured rubric. Each criterion is scored independently.',
  },
]

export const STATS = [
  { label: 'Problem Domains', value: '8' },
  { label: 'Expected Teams', value: '250+' },
  { label: 'Partner Departments', value: '12+' },
  { label: 'Mentor Hours', value: '2k+' },
]
