import { DirectoryController } from './directory.controller';

describe('DirectoryController reception routes', () => {
  it('uses the route target rather than body identity for delegate updates', async () => {
    const service: any = { setDelegate: jest.fn().mockResolvedValue({}) };
    const controller = new DirectoryController(service);
    const user = { id: 'actor' };
    await controller.setDelegate(1, 'actor', { full: true }, user);
    expect(service.setDelegate).toHaveBeenCalledWith(1, 'actor', { full: true }, user);
  });
});
