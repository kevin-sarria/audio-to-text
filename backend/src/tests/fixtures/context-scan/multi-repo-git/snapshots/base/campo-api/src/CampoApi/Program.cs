using CampoApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<CampoDbContext>();
builder.Services.AddIdentityCore<Usuario>(options =>
{
    // Bloqueo de cuenta: 5 intentos fallidos bloquean el login 15 minutos.
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
});
builder.Services.AddScoped<SesionService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CampoDbContext>();
    db.Database.EnsureCreated();
}

app.MapControllers();
app.Run();
