import nodemailer from 'nodemailer';

export function makeTransport(config = {}) {
  const transport = config.transport ?? process.env.SMTP_TRANSPORT;
  if (transport === 'json') {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  if (transport === 'stream') {
    return nodemailer.createTransport({ streamTransport: true, newline: 'unix' });
  }

  const host = config.host ?? process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(config.port ?? process.env.SMTP_PORT ?? 587);
  const secure = config.secure ?? port === 465;
  const user = config.user ?? process.env.SMTP_USER;
  const pass = config.pass ?? process.env.SMTP_PASS;
  const transporterConfig = {
    host,
    port,
    secure: Boolean(secure),
  };
  if (user) {
    transporterConfig.auth = { user, pass };
  }
  return nodemailer.createTransport(transporterConfig);
}
