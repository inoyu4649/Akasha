import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "./prisma.js";

const ALLOWED_DOMAIN = "hafs.hs.kr";
const ADMIN_EMAIL = "022207@hafs.hs.kr";

// Called explicitly after dotenv.config() in index.ts.
// Must NOT run at module evaluation time — env vars aren't loaded yet (ESM hoisting).
export function initPassport() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.warn("[passport] GOOGLE_CLIENT_ID / SECRET not set — Google OAuth disabled");
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const emailEntry = profile.emails?.[0];
          const email = emailEntry?.value;
          if (!email) return done(new Error("NO_EMAIL"));

          const emailVerified =
            (emailEntry as { verified?: boolean | string }).verified === true ||
            (emailEntry as { verified?: boolean | string }).verified === "true" ||
            (profile._json as { email_verified?: boolean })?.email_verified === true;

          if (!emailVerified) return done(null, false, { message: "EMAIL_NOT_VERIFIED" });

          const domain = email.toLowerCase().split("@")[1];
          if (domain !== ALLOWED_DOMAIN) return done(null, false, { message: "DOMAIN_NOT_ALLOWED" });

          const isAdmin = email.toLowerCase() === ADMIN_EMAIL;

          const user = await prisma.user.upsert({
            where: { googleId: profile.id },
            update: {
              name: profile.displayName || email.split("@")[0],
              picture: profile.photos?.[0]?.value ?? null,
            },
            create: {
              email,
              name: profile.displayName || email.split("@")[0],
              picture: profile.photos?.[0]?.value ?? null,
              googleId: profile.id,
              role: isAdmin ? "ADMIN" : "USER",
              dailyCredits: 30,
              isActive: true,
            },
          });

          if (!user.isActive) return done(null, false, { message: "ACCOUNT_DEACTIVATED" });

          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );

  console.log("[passport] Google strategy registered");
}

export default passport;
