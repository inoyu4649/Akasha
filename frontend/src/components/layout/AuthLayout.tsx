import s from "./AuthLayout.module.css";

interface Props {
  title: string;
  children: React.ReactNode;
}

export default function AuthLayout({ title, children }: Props) {
  return (
    <div className={s.wrapper}>
      <div className={s.card}>
        <div className={s.logo}>
          <img src="/logo.png" className={s.logoImg} alt="Akasha" />
        </div>
        <h1 className={s.title}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export { s as css };
