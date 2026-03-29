import { Car, Github, Twitter, Linkedin, Instagram, Mail, ArrowRight, Leaf } from "lucide-react";
import { Link } from "react-router-dom";

const footerLinks = {
  Product: [
    { label: "How It Works", href: "#how-it-works" },
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Safety", href: "#" },
    { label: "Download App", href: "#" },
  ],
  Company: [
    { label: "About Us", href: "/about" },
    { label: "Our Vision", href: "/vision" },
    { label: "Careers", href: "#" },
    { label: "Press", href: "#" },
    { label: "Blog", href: "#" },
  ],
  Support: [
    { label: "Help Center", href: "#" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
    { label: "Cookie Policy", href: "#" },
  ],
  Community: [
    { label: "Drivers", href: "#" },
    { label: "Riders", href: "#" },
    { label: "Partners", href: "#" },
    { label: "Events", href: "#" },
    { label: "Ambassador Program", href: "#" },
  ],
};

const socials = [
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: Linkedin, label: "LinkedIn", href: "#" },
  { icon: Instagram, label: "Instagram", href: "#" },
  { icon: Github, label: "GitHub", href: "#" },
];

const Footer = () => {
  return (
    <footer className="bg-foreground pt-20 pb-8 relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[200px] bg-primary/5 rounded-full blur-[100px]" />

      <div className="container relative z-10">
        {/* Newsletter strip */}
        <div className="bg-gradient-primary rounded-3xl px-8 py-10 mb-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-display font-bold text-white mb-1">Stay in the loop 🚗</h3>
            <p className="text-white/70 text-sm">Get the latest on new cities, features, and sustainability reports.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <input
              type="email"
              placeholder="Enter your email"
              className="bg-white/15 border border-white/20 rounded-xl px-5 py-3 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 w-full sm:w-72"
            />
            <button className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-primary font-semibold text-sm hover:bg-white/90 transition-colors whitespace-nowrap">
              Subscribe <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Links grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-14">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Car className="w-4 h-4 text-white" />
              </div>
              <span className="font-display text-lg font-bold text-primary-foreground">CarpConnect</span>
            </div>
            <p className="text-xs text-primary-foreground/40 leading-relaxed mb-5 max-w-[200px]">
              Smarter, safer, and more sustainable rides for everyone. Built for the planet.
            </p>

            {/* Sustainability badge */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald/10 border border-emerald/20 mb-5 w-fit">
              <Leaf className="w-3 h-3 text-emerald" />
              <span className="text-xs text-emerald font-medium">Carbon Neutral Platform</span>
            </div>

            <div className="flex gap-2">
              {socials.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-9 h-9 rounded-lg bg-primary-foreground/5 flex items-center justify-center hover:bg-primary-foreground/10 hover:text-primary transition-all"
                >
                  <Icon className="w-4 h-4 text-primary-foreground/50" />
                </a>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-xs font-display font-semibold text-primary-foreground uppercase tracking-wider mb-5">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("/") ? (
                      <Link to={link.href} className="text-xs text-primary-foreground/40 hover:text-primary-foreground/80 transition-colors">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="text-xs text-primary-foreground/40 hover:text-primary-foreground/80 transition-colors">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* App badges */}
        <div className="flex flex-wrap gap-3 mb-12">
          {[
            { store: "App Store", icon: "🍎", sub: "Download on the" },
            { store: "Google Play", icon: "▶", sub: "Get it on" },
          ].map((b) => (
            <a
              key={b.store}
              href="#"
              className="flex items-center gap-3 px-5 py-3 rounded-xl bg-primary-foreground/5 border border-primary-foreground/10 hover:bg-primary-foreground/10 transition-colors"
            >
              <span className="text-lg">{b.icon}</span>
              <div>
                <div className="text-[10px] text-primary-foreground/30">{b.sub}</div>
                <div className="text-sm font-semibold text-primary-foreground">{b.store}</div>
              </div>
            </a>
          ))}
        </div>

        {/* Bottom row */}
        <div className="border-t border-primary-foreground/10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-primary-foreground/30">© 2026 CarpConnect, Inc. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors">Privacy</a>
            <a href="#" className="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors">Terms</a>
            <a href="#" className="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors">Cookies</a>
          </div>
          <p className="text-xs text-primary-foreground/30">Built with 💚 for a greener planet</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
