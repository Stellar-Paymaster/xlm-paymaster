export class ApiChaosMonkey {
  constructor(private options: { dropProbability: number; enabled: boolean }) {}

  middleware() {
    return (req: any, res: any, next: any) => {
      if (!this.options.enabled) {
        return next();
      }

      const randomValue = Math.random();
      if (randomValue < this.options.dropProbability) {
        console.warn('Chaos Monkey: Dropping database connection simulation');
        return res.status(503).json({ error: 'Service Unavailable - Chaos Monkey Intervention' });
      }

      next();
    };
  }
}
